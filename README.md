# Chrome Evidence

A local Chrome extension and MCP server for recording bug evidence alongside an agent's existing Chrome browser controls. It does not drive the browser or attach another debugger.

- Cropped video: test ID, role + name, CSS selector, viewport rectangle, or a union of targets.
- Automatic red click rings, including browser-generated pointer events.
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

The agent supplies a Chrome tab ID and its exact current URL to `capture_start`. An approval window opens. Click **Approve & choose tab**, grant access to that site if prompted, then select the requested tab in Chrome's sharing picker and click **Share**. Recording starts automatically. No toolbar click or agent computer-use action is required to initiate capture. Chrome/macOS may require screen-recording permission and a Chrome restart on first use.

The selected tab is verified using its capture handle before recording starts; choosing another tab fails closed. The stream remains active between clips until `release`, the tab closes, or Chrome stops sharing. Site permissions are requested per origin on approval. No microphone or tab audio is captured. The legacy toolbar activation remains available.

The generated extension contains a local pairing token. `.runtime/`, `dist/`, and captured `artifacts/` are ignored by Git. Run setup separately on each machine; do not distribute a generated extension containing your pairing token. The service binds only to `127.0.0.1:47321`.

## Agent workflow

1. `capture_start` with `tabId`, exact current `url`, and optional region.
2. If it returns `awaiting_approval`, call `capture_wait` with the returned `requestId`. Begin interactions only when `recording` is true. A pending request can be waited on again.
3. Interact using the normal Chrome browser tools.
4. `capture_stop` to receive the clip, original, and manifest paths.
5. Start additional clips or use `capture_screenshot` for annotated static images. The same enabled tab needs no additional approval between clips.
6. `capture_release` at the end of the testing session.

The crop is fixed in viewport coordinates for a clip. Scroll relevant elements into view before starting. Avoid resizing the browser during a clip. Use a larger container to include menus or other content that appears later. Missing or ambiguous targets produce errors rather than silently selecting something else. Codex's private accessibility element numbers are not portable to this extension.

CLI and MCP use exactly the same validation and service:

```sh
npm run capture -- status
npm run capture -- start '{"tabId":1234,"url":"https://example.com/settings","region":{"testId":"publish-dialog"}}'
npm run capture -- wait '{"requestId":"<UUID returned by start>"}'
# Use the existing Chrome controls here.
npm run capture -- stop '{"name":"Publish failed"}'
npm run capture -- screenshot '{"region":{"testId":"publish-dialog"},"highlight":[{"target":{"role":"button","name":"Publish"},"label":"No response"}]}'
npm run capture -- release
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

The recorder samples a downscaled clean crop five times per second. Changes above a small area/color threshold and actual page input events identify activity. It retains 0.6 seconds before and 0.7 seconds after interactions, and collapses idle gaps of at least 0.8 seconds between retained activity windows. Visual changes retain their own context. The initial 0.8 seconds and final 0.6 seconds remain. Small blinking carets generally do not retain an entire gap. The recording itself is 15fps; click rings and the elapsed-time clock are composed into the output, not injected into the page.

Every cut shows the omitted duration. `manifest.json` records the original-to-edited timeline, input timestamps, crop, and source URL. `original.webm` preserves the entire cropped recording. `preserveTiming: true` disables trimming for performance bugs or subtle visual changes. The heuristic cannot distinguish agent thinking from an application freeze; use the original and timestamps when timing is evidence. It does not remove all animations, spinners, or large repetitive changes.

## Current boundaries

- One globally enabled tab and one recording at a time; local files only. All MCP clients share this session. Concurrent starts are rejected, but commands do not carry agent ownership: another client can stop the active recording. Do not use concurrently from independent agents.
- Opening or attaching to a tab with Codex does not enable it for this extension. Supply its tab ID and exact URL to request user approval before starting clips. Switching the foreground tab does not select a different recording source; background rendering and focus-free browser interaction have not yet been validated.
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

After rebuilding, reload the extension in Chrome, request capture approval again, and restart the local service after server changes. Tests exercise real FFmpeg encoding and the MCP handshake, along with timing, schemas, approval target checks, wrong-tab cleanup, and native picker error propagation. `http://127.0.0.1:47321/demo` provides a deterministic interactive fixture for browser validation.
