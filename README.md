# Chrome Evidence

A local Chrome extension and MCP server for recording bug evidence alongside an agent's existing Chrome browser controls. It does not drive the browser or attach another debugger.

- Cropped video: test ID, role + name, CSS selector, viewport rectangle, or a union of targets.
- Thin, unfilled click rings with Chrome’s native pointer (reconstructed for the optional sharing-picker flow).
- Independent multi-tab capture sessions with queued, one-click approvals.
- PNG screenshots with red boxes, arrows, and optional labels.
- Automatic idle trimming with visible omission badges and an elapsed-time clock.
- Original WebM plus reviewable H.264 MP4 and a JSON timing manifest.
- Compact MCP responses containing local file paths. No frames or base64 in the agent context.

## Setup

Requires Node 22+, Chrome 116+, and `ffmpeg` / `ffprobe` on PATH.

```sh
npm ci
npm run setup
npm start
```

In Chrome, open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select this repository's `dist/extension` folder. The extension connects to the local service automatically.

Pin the Chrome Evidence toolbar icon. The agent supplies a Chrome tab ID and its exact current URL to `capture_start`. The extension brings that tab forward and shows **REC?**. Click the toolbar icon once to approve: recording starts automatically, with no tab picker or popup. Clicking on another tab or after the target URL changes is rejected. Requests are queued in order; only the presented request focuses its tab. Its two-minute approval deadline starts when presented. Already enabled sessions continue recording while another request awaits approval. The agent initiates this entirely through the capture tool; no agent computer use is required for approval.

The alternative `approval: "picker"` flow opens an approval window, requests site access when needed, and shows Chrome's tab-sharing picker. It verifies the selected tab using its capture handle and closes the approval window automatically after recording starts. Chrome/macOS may require screen-recording permission and a Chrome restart on first use of that flow.

The stream remains active between clips until `release`, the tab closes, or Chrome stops sharing. No microphone or tab audio is captured. Clicking the toolbar without a pending request does not enable another session. Enabled streams use some memory/CPU, but video is collected only between start and stop. Completed clips wait in memory until retrieved; nothing continuously records to disk.

The generated extension contains a local pairing token. `.runtime/`, `dist/`, and captured `artifacts/` are ignored by Git. Run setup separately on each machine; do not distribute a generated extension containing your pairing token. The service binds only to `127.0.0.1:47321`.

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

## MCP configuration

For Codex, register the local stdio server (substitute your absolute checkout path):

```sh
codex mcp add chrome-evidence -- node /absolute/path/to/chrome-evidence/src/mcp.js
```

For clients using JSON MCP configuration:

```json
{
  "mcpServers": {
    "chrome-evidence": {
      "command": "node",
      "args": ["/absolute/path/to/chrome-evidence/src/mcp.js"]
    }
  }
}
```

The capture service (`npm start`) must also be running. The MCP process only provides the tool interface; it never writes logs to stdout. A client may need restarting after adding an MCP server. The CLI works immediately without changing client configuration.

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

After rebuilding, reload the extension in Chrome, request capture approval again, and restart the local service after server changes. Tests exercise real FFmpeg encoding and the MCP handshake, along with timing, schemas, approval target checks, wrong-tab cleanup, native picker error propagation, FIFO approval/expiry/cancellation, per-session operation locks, tab ownership, and independent routing through the background worker. `http://127.0.0.1:47321/demo` provides a deterministic interactive fixture for browser validation.

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
