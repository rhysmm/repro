# Validation checklist

Automated checks:

- [x] Idle trimming preserves input context and records omitted time.
- [x] Timing-preservation mode keeps delays.
- [x] Continuous visual changes remain in the timeline.
- [x] Small repetitive changes fall below the idle threshold.
- [x] Invalid and excessive capture inputs are rejected.
- [x] Real FFmpeg output decodes as H.264 at the expected dimensions.
- [x] MCP initialization and tool discovery work with the official client SDK.
- [x] Unauthenticated HTTP control requests are rejected.
- [x] Lint and dependency audit pass.

Real Chrome integration — November 5, 2026, using Codex’s existing Chrome controls:

- [x] Enable the built extension alongside Codex Chrome browser use.
- [x] Record actual Codex browser clicks with automatic visible rings.
- [x] Crop to a test ID, role/name, multiple elements, and a rectangle.
- [x] Produce a PNG with a red box, arrow, and label.
- [x] Remove a long idle gap while preserving click/result footage.
- [x] Inspect the cut badge and original elapsed-time clock.
- [x] Preserve a deliberately slow application response.
- [x] Reject missing/ambiguous/offscreen targets.
- [x] Automatically stop at the clip duration limit.
- [x] Release the stream and verify capture has stopped.

Observed output: a 45.690-second source became a 6.600-second timeline (39.090 seconds omitted), with both actual browser clicks recorded. The fixed crop was 968 × 418 encoded pixels. A separate 18.002-second capture retained the full five-second application delay and stopped automatically at its configured limit. A real MCP client initiated that recording. The screenshot, click ring, and omission badge were visually inspected; both MP4s decoded without errors. Rectangle output was exactly 300 × 180 pixels.

Timing refinement: changed post-interaction context to 0.7 seconds and minimum omitted gap to 0.8 seconds. Reprocessing the same real source retains 4.093 seconds, down from 6.600 seconds. All nine tests and lint pass. Background-tab validation was not completed because the user was actively using Chrome; simultaneous-agent operation remains unsupported.


## Agent-requested approval and Sunny Today demos (2026-11-05)

Version 0.2.1 uses getDisplayMedia in an offscreen document with DISPLAY_MEDIA. The initial desktopCapture call from the service worker failed; it has been replaced. After the user granted Chrome screen recording permission and restarted Chrome, the agent requested capture using the restored tab ID and URL. The user approved and selected the requested tab. Capture-handle verification succeeded and recording started automatically. No toolbar activation or native computer-use automation was used to initiate capture.

Three clips were recorded on app.dhdev.co for Sunny Today using ordinary Chrome browser controls:

| Flow | Source seconds | MP4 seconds | Clicks |
| --- | ---: | ---: | ---: |
| Search cloudy, table view, grid view | 70.722 | 8.467 | 3 |
| Open creator profile, Socials, Campaigns | 34.882 | 10.533 | 3 |
| Open filters, select YouTube, Apply | 45.716 | 7.667 | 3 |

All three files decode as H.264 MP4. Sampled frames were inspected for page content, click rings, and omission labels. An annotated screenshot highlighted the selected channel panel. The filter drawer reflows the page leftward; the fixed crop includes the filter controls but excludes part of the leftmost card. Search and filters were cleared afterward, and the media session was released. No creator data was modified.

Lint and all 15 automated tests pass. Wrong-tab selection is covered by unit tests, not a live intentionally incorrect share. Concurrent independent recording and background rendering remain unvalidated/unsupported as described in the README.
