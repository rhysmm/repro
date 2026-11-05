# Chrome Evidence

A local Chrome extension and MCP server for recording bug evidence alongside an agent's existing Chrome browser controls. It does not drive the browser or attach another debugger.

- Cropped video: test ID, role + name, CSS selector, viewport rectangle, or a union of targets.
- Thin, unfilled click rings with Chrome’s native pointer (reconstructed for the optional sharing-picker flow).
- Independent multi-tab capture sessions with queued, one-click approvals.
- PNG screenshots with red boxes, arrows, and optional labels.
- Automatic idle trimming with visible omission badges and an elapsed-time clock.
- Original WebM plus reviewable H.264 MP4 and a JSON timing manifest.
- Compact MCP responses containing local file paths. No frames or base64 in the agent context.

## Install on macOS

Requires Node 22 or newer, npm, FFmpeg (`ffmpeg` and `ffprobe`), Chrome 116+, and Codex. If needed, install prerequisites with `brew install node ffmpeg`.

Clone the repository into a location you intend to keep, then run:

```sh
npm ci && npm run install:local
```

No `sudo` is needed. The installer:

- Builds the unpacked extension in `dist/extension` and creates a private local pairing token.
- Installs a per-user macOS LaunchAgent (`dev.chrome-evidence.service`) that starts at login and restarts the service if it crashes.
- Registers `chrome-evidence` as an authenticated HTTP MCP server in your Codex user configuration (`$CODEX_HOME/config.toml`, or `~/.codex/config.toml`). It replaces an earlier Chrome Evidence stdio entry while preserving unrelated configuration and tool policies. Backups are stored privately under `.runtime/`.
- Checks that the service is healthy and prints the exact Chrome extension folder.

The checkout is the installed application; keep it in place. Paths to Node and FFmpeg are resolved at install time. If you move the checkout or change your Node/FFmpeg installation, rerun the installer from the new location. Do not install multiple checkouts simultaneously; the managed service and port are shared per user.

### Manual Chrome step

1. Open Chrome and visit `chrome://extensions`.
2. Turn on **Developer mode** in the top-right corner.
3. Click **Load unpacked**.
4. Select this repository’s **`dist/extension`** folder, not the source `extension` folder. The installer prints its full path.
5. Open Chrome’s Extensions menu (puzzle icon) and pin **Chrome Evidence**.

For an existing unpacked installation, click **Reload** instead. The extension connects to the service automatically. Refresh/restart the MCP connection in Codex after installation; an existing chat may need a new connection or chat to receive the updated tool catalog. You do not need to keep a terminal open or start an MCP process manually.

### Normal operation

There are two persistent components: the Chrome extension and one local service containing both the MCP endpoint and capture bridge. Codex connects to `http://127.0.0.1:47321/mcp`. Multiple clients share this service; their recording sessions remain independent. Temporary FFmpeg processes encode requested videos. A running service or enabled tab does not continually save video to disk.

The agent supplies a Chrome tab ID and its exact current URL to `capture_start`. The extension brings that tab forward and shows **REC?**. Click the toolbar icon once to approve. No tab picker or popup is needed. Requests are queued; only the presented request focuses its tab, and its two-minute approval deadline starts then. Existing recordings continue while another request awaits approval.

The stream remains active between clips until explicitly released, the tab closes, or Chrome stops sharing. No microphone or tab audio is captured. Completed clips remain in memory until retrieved. Reloading the extension or restarting Chrome ends its capture sessions and requires new approvals. A local-service restart reconnects to the extension; in-flight commands fail explicitly and must be checked before retrying, since an action may already have executed. It does not intentionally end browser capture sessions.

The alternative `approval: "picker"` flow uses Chrome’s sharing picker, verifies the selected tab, and closes its approval window after recording starts. Chrome/macOS may require screen-recording permission and a Chrome restart for that flow.

### Updates, diagnostics, and removal

Finish any active recordings before updating. After pulling an update, run the same command:

```sh
npm ci && npm run install:local
```

Reload Chrome Evidence in `chrome://extensions` when its extension files change. Refresh the Codex MCP connection when tool definitions change. Reinstallation keeps the pairing token and capture files.

```sh
npm run service:status
npm run service:restart
npm run uninstall:local
```

Logs are in `.runtime/service.log` and `.runtime/service-error.log`. Uninstall removes the LaunchAgent and this service’s MCP entry; it keeps recordings and pairing settings. Remove the extension manually through `chrome://extensions` if desired.

If the port is already occupied, the installer stops with an explanation. For an earlier manual setup, stop its `npm start` process and rerun installation; the installer does not kill unowned processes. Backups of your Codex configuration are kept in `.runtime/codex-config-backup-*.toml`.

If Chrome is closed or the extension is unavailable, MCP still connects. Its initialization instructions and `capture_status` provide the exact extension path and the manual installation steps. A disconnected extension might be uninstalled, disabled, or simply in a closed browser; the agent should explain that distinction. If the service itself is unavailable, MCP cannot provide setup help: run `npm run service:status` or rerun installation.

`.runtime/`, `dist/`, and `artifacts/` are ignored by Git. Generated configuration contains a local pairing token: do not share generated files or configuration backups. The HTTP service binds only to `127.0.0.1`, checks the host and token, and rejects browser-origin MCP requests. Each machine needs its own installation.

### Manual development or other platforms

Managed installation is currently macOS-only. For manual operation:

```sh
npm ci
npm run setup
npm start
```

The service still exposes HTTP MCP. Configure the client with the local `/mcp` URL and an Authorization bearer header using the private token in `.runtime/config.json`. Use a platform-specific process manager if you need automatic startup. Do not run a manual service while the macOS-managed service is using the same port.

## Agent workflow

1. `capture_start` with `tabId`, exact current `url`, and optional region.
2. Save the returned `sessionId`. The user clicks the toolbar icon once when the requested tab is presented. If start returns `awaiting_approval` or `queued`, call `capture_wait` with the returned `sessionId` and `requestId`. Begin interactions only when `recording` is true. A pending request can be waited on again.
3. Interact using the normal Chrome browser tools.
4. `capture_stop` with `sessionId` to receive the clip, original, and manifest paths.
5. Pass the same `sessionId` to start additional clips or use `capture_screenshot` for annotated static images. The same enabled tab needs no additional approval between clips.
6. Leave the session enabled between testing sessions. Use `capture_release` with its `sessionId` only when you want to stop sharing or cancel a pending approval.

The crop is fixed in viewport coordinates for a clip. Scroll relevant elements into view before starting. Avoid resizing the browser during a clip. Use a larger container to include menus or other content that appears later. Missing or ambiguous targets produce errors rather than silently selecting something else. Codex's private accessibility element numbers are not portable to this extension.

CLI and MCP use exactly the same validation and service:

```sh
npm run capture -- status
npm run capture -- start '{"tabId":1234,"url":"https://example.com/settings","region":{"testId":"publish-dialog"}}'
npm run capture -- wait '{"sessionId":"<session UUID>","requestId":"<UUID returned by start>"}'
# Use the existing Chrome controls here.
npm run capture -- stop '{"sessionId":"<session UUID>","name":"Publish failed"}'
npm run capture -- screenshot '{"sessionId":"<session UUID>","region":{"testId":"publish-dialog"},"highlight":[{"target":{"role":"button","name":"Publish"},"label":"No response"}]}'
npm run capture -- release '{"sessionId":"<session UUID>"}'
```

Other region examples:

```json
{"region":{"selector":".settings-panel"}}
{"region":{"role":"dialog","name":"Publish post"},"padding":32}
{"region":[{"testId":"title"},{"testId":"error"}]}
{"region":{"x":100,"y":80,"width":700,"height":500},"padding":0}
{"preserveTiming":true,"maxSeconds":30}
```

Screenshot highlights accept `style: "box"` (default) or `"arrow"`. Use a crop with enough space for the label. With no region, capture uses the visible viewport. Default clip limit is 90 seconds, maximum 180. After automatic stop, call `stop` to retrieve the completed clip before starting another.

## What the agent sees

The server identifies itself as **Chrome Evidence — screenshots and recordings**, configured under `chrome-evidence`. At initialization, it provides server-wide instructions that begin:

> Use Chrome Evidence to save cropped screenshots, annotated PNGs, and short screen recordings while testing or demonstrating websites with your existing Chrome browser controls. It adds click indicators and trims idle time automatically.

The tool catalog supplies names, titles, descriptions, and validated argument schemas:

| Tool | Purpose |
| --- | --- |
| `capture_status` | Readiness, installation help, and scoped session status |
| `capture_start` | Cropped video evidence with click indicators and idle trimming |
| `capture_wait` | Wait up to 50 seconds for queued approval |
| `capture_stop` | Save the video and return MP4, WebM, and manifest paths |
| `capture_screenshot` | Cropped PNGs with boxes, arrows, and labels |
| `capture_release` | Explicitly end a session or cancel its approval |

Codex may display names with a server prefix or load tools on demand; exact presentation depends on the client. These descriptions explain when to use capture, but cannot guarantee the agent chooses it every time. For an explicit instruction, say “Use Chrome Evidence for screenshots and recordings.” Browser tools remain responsible for navigating and clicking; this service supplies saved evidence. Native browser screenshots can still be used for immediate UI observation.

For a screenshot on a new tab, establish and approve a session with `capture_start`, retrieve its initial clip with `capture_stop`, then call `capture_screenshot`. Existing approved sessions need no new approval.

The optional `src/mcp.js` stdio adapter remains for compatibility and development. The managed installation does not run it; it registers the integrated HTTP endpoint instead. The CLI calls the same validated capture service.

Official documentation: [Codex MCP configuration and server instructions](https://learn.chatgpt.com/docs/extend/mcp?surface=cli), [macOS LaunchAgents](https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/CreatingLaunchdJobs.html).

## Timing and evidence fidelity

The recorder samples a downscaled clean crop five times per second. Changes above a small area/color threshold and actual page input events identify activity. It retains 0.6 seconds before and 0.7 seconds after interactions, and collapses idle gaps of at least 0.8 seconds between retained activity windows. Visual changes retain their own context. The initial 0.8 seconds and final 0.6 seconds remain. Small blinking carets generally do not retain an entire gap. The recording itself is 15fps; click rings, pointer, and the elapsed-time clock are composed into the output, not injected into the page. Click rings fade over 0.45 seconds. With the sharing-picker flow, the pointer is reconstructed from observed page input positions and remains at the last observed position between events; it is an evidence overlay, not a guaranteed reproduction of the OS cursor shape. Pointer movement alone does not add activity events to the trimming timeline. The direct toolbar flow uses Chrome’s native cursor on the active tab and reconstructs a pointer from page events for inactive tabs. The fallback follows tab activation changes; it holds the last observed position and does not reproduce every native cursor shape. Chrome may still supply its native cursor in the sharing-picker source stream.

Every cut shows the omitted duration. `manifest.json` records the original-to-edited timeline, input timestamps, crop, and source URL. `original.webm` preserves the entire cropped recording. `preserveTiming: true` disables trimming for performance bugs or subtle visual changes. The heuristic cannot distinguish agent thinking from an application freeze; use the original and timestamps when timing is evidence. It does not remove all animations, spinners, or large repetitive changes.

## Multiple agents

Every new tab gets an unguessable `sessionId`. Treat it as an ownership capability: pass it to every subsequent operation on that session and do not share it with unrelated agents. There is no global current session. Unscoped status returns counts only; it never lists session handles. A second agent cannot reserve an already-owned tab. Different sessions can record, stop, encode, take screenshots, and wait for approval independently. Per-session operation locks prevent competing changes to a single recorder. Input events are routed using Chrome’s sender tab ID.

The capability prevents accidental cross-agent control; it is not a security boundary against a local process with the pairing token and another session’s handle. An agent that loses its handle cannot rediscover it through global status. Reloading the extension ends all sessions. Save handles in your testing context, or explicitly release sessions before handing their tabs to another agent.

Approvals are serialized across agents. Approving tab A starts its clip, then presents tab B for its own single click. Closing a requested tab, cancelling its session, or expiration advances the queue. A queued request does not consume its two-minute approval window. Expiration is checked during waits and by a periodic Chrome alarm. Each tab has its own badge. The recording source remains bound to its tab when another tab is focused; focus-sensitive application behavior and Chrome’s background throttling can still affect interactions.

## Current boundaries

- One session per tab, with multiple sessions recording simultaneously; local files only. Recording and encoding resource usage increases with the number and size of captures.
- Opening or attaching to a tab with Codex does not enable it for this extension. Supply its tab ID and exact URL to request user approval before starting clips. Switching the foreground tab does not select a different recording source. Browser control tools may still bring tabs forward for interactions.
- Top-level DOM, open shadow roots, and same-origin frames. Cross-origin frame targeting/click instrumentation and closed shadow roots are not supported. Their pixels can still appear in a viewport capture.
- Role/name matching supports common native controls and explicit ARIA roles, not the entire accessibility-name specification. Test IDs or CSS selectors are the precise fallback.
- Captures page content, not Chrome toolbar, native file pickers, or browser permission dialogs.
- Fixed crops do not follow moving elements. Navigation may invalidate the region or site instrumentation permissions; start a fresh clip and request approval again when necessary.
- Original and edited files contain whatever is visible in the crop. There is no automatic redaction.

## Development

```sh
npm test
npm run lint
npm run setup
```

After rebuilding, reload the extension in Chrome, request capture approval again, and run `npm run service:restart` after server changes (or restart `npm start` for manual development). Tests exercise real FFmpeg encoding and the MCP handshake, along with timing, schemas, approval target checks, wrong-tab cleanup, native picker error propagation, FIFO approval/expiry/cancellation, per-session operation locks, tab ownership, and independent routing through the background worker. `http://127.0.0.1:47321/demo` provides a deterministic interactive fixture for browser validation.

## Live validation (0.4.0)

Validated in Chrome on 2026-11-05 with two independent sessions on separate fixture tabs:

- Simultaneous start requests produced one presented approval and one queued approval. Each required one toolbar click; both recordings then ran together.
- Tab A recorded a delayed save completing while tab B was active. Its annotated background screenshot showed the completed result.
- Stopping and encoding A left B recording. B captured another click afterward. Each manifest contained only its own source URL, session ID, and clicks (A: 1, B: 2).
- Both clips were cropped to 968 × 418. Idle trimming reduced A from 33.9 to about 4.1 seconds and B from 50.1 to about 4.4 seconds; extracted frames were visually inspected.
- Starting a second clip with A’s existing handle needed no approval. A duplicate reservation of its tab and a stop using an unknown handle were rejected.
- Final status: two enabled sessions, zero recordings. Sessions were retained for reuse.

Automated tests also cover independent release and approval cancellation/expiry. Native picker fallback retains its existing media tests; the multi-tab live test used toolbar approval.

### Cursor regression (0.4.1)

The initial multi-tab clips exposed a missing cursor on the inactive tab. Toolbar recordings now use a page-event pointer overlay only when the source tab is inactive, switching on Chrome tab activation events. A second live two-tab test verified a visible fallback pointer during the background save and one native pointer on the foreground tab. The captured click frames were inspected separately. All 24 tests and lint pass. Both sessions remain enabled with recording stopped.

### Managed service validation (0.5.0)

Validated fresh registration and repeated installation on macOS, automatic launchd recovery after a forced process crash, and Chrome reconnection. A real HTTP MCP client recorded a 968 × 418 clip across a service restart, retrieved both clicks and the delayed UI update, and saved an annotated screenshot. The 54.1-second recording trimmed to about 4.4 seconds. The approved capture remained enabled afterward.

Automated coverage includes real HTTP MCP initialization/tool discovery without an extension, actionable setup responses, token/origin checks, concurrent clients, configuration preservation/idempotence, and the existing capture tests. macOS login startup is configured by RunAtLoad; this session did not log out to test a fresh login.
