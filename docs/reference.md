# Reference and maintenance

[Back to the README](../README.md)

## Installation notes

The managed installer is macOS-only. It registers an authenticated HTTP MCP endpoint in your Codex user configuration and a per-user LaunchAgent that starts the local service at login and restarts it after a crash. No terminal needs to stay open.

Keep the checkout in place: it is the installed application. Rerun installation if you move it or change Node/FFmpeg paths. Install only one checkout per user. The service listens on `127.0.0.1:47321`.

Upgrading from Chrome Evidence migrates its MCP settings and managed service to `repro`, preserving tool policies and the pairing token. After moving an unpacked extension, load `dist/extension` from its new location in Chrome, or keep a compatibility symlink at the old path and reload the existing extension. Restart Codex to load the renamed MCP entry.

## Updates and troubleshooting

Finish any active recordings before updating. After pulling an update, run the same command:

```sh
npm ci && npm run install:local
```

Reload Repro in `chrome://extensions` when its extension files change. Refresh the Codex MCP connection when tool definitions change. Reinstallation keeps the pairing token and capture files.

```sh
npm run service:status
npm run service:restart
npm run uninstall:local
```

Logs are in `.runtime/service.log` and `.runtime/service-error.log`. Uninstall removes the LaunchAgent and this service’s MCP entry; it keeps recordings and pairing settings. Remove the extension manually through `chrome://extensions` if desired.

If the port is already occupied, the installer stops with an explanation. For an earlier manual setup, stop its `npm start` process and rerun installation; the installer does not kill unowned processes. Backups of your Codex configuration are kept in `.runtime/codex-config-backup-*.toml`.

If Chrome is closed or the extension is unavailable, MCP still connects. Its initialization instructions and `capture_status` provide the exact extension path and the manual installation steps. A disconnected extension might be uninstalled, disabled, or simply in a closed browser; the agent should explain that distinction. If the service itself is unavailable, MCP cannot provide setup help: run `npm run service:status` or rerun installation.

`.runtime/`, `dist/`, and `artifacts/` are ignored by Git. Generated configuration contains a local pairing token: do not share generated files or configuration backups. The HTTP service binds only to `127.0.0.1`, checks the host and token, and rejects browser-origin MCP requests. Each machine needs its own installation. Website access enables the pre-approval banner; it does not authorize recording. Capturing a new tab still requires the user’s toolbar click. No page input instrumentation is installed until approval. If site access is withheld or the page is restricted, the agent receives a banner-unavailable explanation and toolbar approval remains available where Chrome permits capture.

## Manual operation

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

## Approval and session lifetime

The toolbar badge reflects whether capture is enabled. A bad crop or annotation target is reported to the agent without changing an enabled tab to `ERR`. A successful capture clears any stale error. `ERR` is reserved for failures to enable capture, such as a permission failure; a new successful approval restores `ON`.

The requested tab is focused and displays an approval banner. A single click on its pinned REC icon authorizes capture. Approvals are queued, with a two-minute deadline starting when each request is presented. “Not now” declines it. Agents must call `capture_wait` immediately and proceed on its result; never require a second chat confirmation. After a full 50-second wait still pending, a brief non-blocking reminder is appropriate.

Approved streams remain available between clips without continuously recording to disk. Reloading the extension, closing the tab, or restarting Chrome ends them. A service restart normally preserves Chrome streams, but an interrupted command may already have executed: check session status before retrying. The optional `approval: "picker"` flow requires Chrome’s tab picker and may need macOS screen-recording permission.

## Keyboard event badges

Recordings automatically show action keys and shortcuts as an ordered “Recent keys” badge, for example **Tab → Enter → Tab**. Ordinary letters, digits, text-entry spaces, IME composition, and modifier-only presses are omitted. Consecutive repeats collapse to **Tab ×3**; separated repeats retain their order. Event metadata contains the shortcut label, never ordinary typed characters, input values, or clipboard contents.

Keys within 0.8 seconds form a burst. The badge appears after that burst’s last key, so it never announces an action before it happens. Each sequence stays visible for at least 1.5 seconds. Long sequences wrap and paginate in order; queued badges are summaries of recent keys, not a claim that every key occurs at display time. Idle trimming keeps keyboard context. If recording ends before badges finish, export briefly holds the final frame so no queued badge is lost. Very small crops use a readable footer instead of squeezing text into the content. The manifest records badge timing and any extra tail time; the original WebM stays unchanged.

This works only for keyboard events delivered to the page. Browser/OS-reserved shortcuts and keys inside inaccessible cross-origin frames may not be observed. No extra tool call or typing delay is needed.

## Readable keyboard reproductions

Explore quickly, then record a deliberate replay of a confirmed bug. Break a meaningful keyboard sequence into separate actions: type the text, observe the state, add a callout if viewers need to inspect it, then press Ctrl-Z and observe/highlight the result. Labels should explain the action and outcome. Callouts provide reading time in the exported video; the agent does not wait for that duration.

For autocomplete, validation, and animations, wait for the relevant visible state or use a brief targeted pause to capture the transition. Use `preserveTiming: true` when elapsed time or a deliberate idle pause matters, because trimming may shorten it. Avoid global per-keystroke delays. Timing-sensitive bugs must retain their triggering input cadence; explain their before/after states without changing the reproduction.

This guidance is supplied in server instructions, the recording tool description, and successful start/approval responses so existing chats with cached tool descriptions also receive it.

## Readable callouts during a recording

At an important result, call `capture_callout`:

```json
{
  "sessionId": "the-active-session-id",
  "target": { "text": "Saved successfully" },
  "label": "The saved state is visible here",
  "holdSeconds": 3
}
```

The tool saves the current annotated frame and returns immediately, without waiting for `holdSeconds`. Continue interacting normally. When `capture_stop` exports the MP4, it inserts that frame at the captured moment for three seconds by default (1–10 supported), then plays the following source footage. Idle trimming retains context around the callout; it never removes the inserted reading time. No new approval is needed.

The website and live recording never pause. `original.webm` stays uninterrupted and contains no callout inserts. The manifest separates source time, omitted idle time, inserted reading time, and the final playback timeline. Each saved callout PNG is included alongside the exported clip. Use element targets inside the current crop; a changed viewport or crop too small for a readable label produces an actionable error. Up to 20 callouts can be added per clip. The clip’s `maxSeconds` limits source recording time; inserted holds can make the exported video longer.

These are editorial freeze-frames, not application delays. `preserveTiming` preserves the complete original footage, with any requested callouts still added to the exported MP4.

## Timing and evidence fidelity

The recorder samples a downscaled clean crop five times per second. Changes above a small area/color threshold and actual page input events identify activity. It retains 0.6 seconds before and 0.7 seconds after interactions, and collapses idle gaps of at least 0.8 seconds between retained activity windows. Visual changes retain their own context. The initial 0.8 seconds and final 0.6 seconds remain. Small blinking carets generally do not retain an entire gap. The recording itself is 15fps; click rings and the pointer are composed into the output, not injected into the page. Click rings fade over 0.45 seconds. With the sharing-picker flow, the pointer is reconstructed from observed page input positions and remains at the last observed position between events; it is an evidence overlay, not a guaranteed reproduction of the OS cursor shape. Pointer movement alone does not add activity events to the trimming timeline. The direct toolbar flow uses Chrome’s native cursor on the active tab and reconstructs a pointer from page events for inactive tabs. The fallback follows tab activation changes; it holds the last observed position and does not reproduce every native cursor shape. Chrome may still supply its native cursor in the sharing-picker source stream.

Timing information stays in the sidecar file rather than covering the video. `manifest.json` records the original-to-edited timeline, input timestamps, crop, and source URL. `original.webm` preserves the entire cropped recording. `preserveTiming: true` disables trimming for performance bugs or subtle visual changes. The heuristic cannot distinguish agent thinking from an application freeze; use the original and timestamps when timing is evidence. It does not remove all animations, spinners, or large repetitive changes.

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
