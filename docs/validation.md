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
