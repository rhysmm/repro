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


## Pointer visibility (0.2.3)

The live 0.2.2 test confirmed that Chrome reported cursor=motion despite a cursor=always request; removing the ring fill alone did not fix missing cursors. Version 0.2.3 draws a persistent pointer above a thin, unfilled ring using observed page pointer positions. In a 320x262 Channels-panel recording, frame inspection at 8fps showed the pointer present during both clicks and after both rings faded. The source was 23.171 seconds and the trimmed timeline 4.237 seconds, with two clicks. Pointer-only events are excluded from the activity event list. The recording manifest identifies the reconstructed pointer. Native OS cursor shape fidelity and all possible native/overlay interactions are not guaranteed.


## One-click approval (0.3.0)

The agent supplied the Sunny Today Chrome tab ID, exact URL, and Channels element crop. The extension selected the requested tab and displayed REC?. A single user toolbar click granted Chrome's tab capture permission and automatically started the requested clip. No approval window or sharing picker was opened. The resulting H.264 MP4 is 320x262, contains both clicks, and trims 26.835 seconds to about 4.5 seconds. Seventeen tests and lint pass, including wrong-tab, changed-URL, expired-request, and picker-mode rejection checks for toolbar approval. Those rejection paths were unit-tested, not manually exercised in Chrome. The retained picker flow now closes its window on recording success; that new auto-close branch has not been live-tested.

Frame inspection also showed that direct tab capture already includes Chrome's cursor, causing a duplicate with the reconstructed overlay. The overlay is now limited to display/picker capture; direct toolbar capture uses the native cursor. This small follow-up passed lint/tests but requires extension reload and has not been re-recorded live.


## Cursor-free capture experiment (0.10.2, November 16)

Added an opt-in `cursorProbe` start flag and `/demo?cursor=1` fixture. Ordinary captures retain the existing pointer behavior. Probe recordings disable Repro's drawn pointer, save pointer samples separately, and report capture-track cursor support/settings. The fixture separately permits toggling CSS `cursor: none`; this affects the live page and is off after testing.

Live Chrome toolbar capture did not advertise the cursor constraint (`getSupportedConstraints().cursor` absent), cursor capabilities, or a cursor setting. A cursor-only `applyConstraints({cursor:{exact:'never'}})` resolved, but did not appear in returned constraints/settings and did not remove the captured pointer. Repro's pointer overlay was disabled throughout. CSS hiding was independently verified by reading computed `cursor: none` on the target, yet an arrow with a blue halo remained in the recorded pixels during Codex browser interactions. It appears to be the automation pointer visualization; its exact implementation was not established. Do not infer that CSS hiding failed to hide the OS cursor, or that every Chrome capture source behaves identically.

The initial 0.10.1 probe incorrectly reapplied the stream's device-ID constraint and received an unrelated OverconstrainedError; that result is inconclusive. Version 0.10.2 isolates the cursor constraint and restores mutable prior constraints after recording. The corrected evidence is `artifacts/444bd454-7e18-47d6-91b1-fb5baf88fdf4` (4.8-second export); the independent CSS comparison is `artifacts/cb4035d6-9198-44ed-a5e0-b96b70628bb8`. Artifacts are local and ignored by Git.

Result: no cursor-free source established for the current toolbar capture + Codex Chrome workflow. Export-time animation was not enabled because it would risk duplicating the cursor already in the footage. No source pixels were erased or reconstructed. Reliable suppression of the browser/automation cursor remains a prerequisite. All 77 tests and lint passed. Tests cover ignored and rejected constraints, restoration, and unexpected-error propagation; live recordings establish the actual browser behavior.

### Follow-up: identified and suppressed the injected pointer

The cursor-free conclusion above was premature. Full-document inspection during an active browser-use turn found `div#codex-agent-overlay-root[data-codex-agent-overlay-root=true]` as a direct child of `<html>`, outside `<body>`. Chrome DevTools exposed its closed shadow root and the nested `[data-testid="browser-agent-cursor"]` element. The previous body-only inspection and ordinary `.shadowRoot` lookup missed it.

Using DevTools' Hide element on only that cursor element suppressed the arrow and halo across subsequent browser clicks and typing. With Repro's replacement pointer disabled, the resulting 4.6-second recording (`artifacts/ad70a209-7ede-4b13-b9e7-81c310d07d96`) showed click rings and editing cues without the pointer in inspected frames. Page-level `cursor:none` was off for this test. Reloading the disposable fixture restored the normal pointer, verified by screenshot; DevTools was closed.

This establishes a viable suppression mechanism for the current Codex overlay, not a finished integration. Chrome extensions can inspect closed roots using the documented `chrome.dom.openOrClosedShadowRoot(element)` API. A future integration should target only the cursor, preserve other overlay UI, handle replacement/navigation, restore visibility after capture, and detect unsupported layouts. The observed host ID and cursor test ID are internal Codex details and may change. Native pointer behavior, background transitions, and other harnesses still need validation before enabling export-time cursor reconstruction by default.


### Extension-controlled suppression and focus transitions (0.10.3)

An opt-in `cursorOverlayProbe` now performs suppression entirely inside Repro's extension, using `chrome.dom.openOrClosedShadowRoot`. It inserts a narrowly scoped style targeting only Codex's cursor, watches replacement nodes/roots, records verification observations and pointer samples, and removes its styles after capture. Unknown layouts remain untouched and are ineligible for animated export. Losing verification makes that eligibility false for the rest of the clip. Export-time animation itself is not implemented yet; normal capture behavior is unchanged.

Live recording `artifacts/e1397e82-fd54-4282-89f8-deab0ba32b6a` exercised foreground → background → foreground, including actual clicks and typing in the background. Chrome tab activation events recorded the switches at 47.261 and 88.988 source seconds. The final report had `supported`, `verified`, and `safeForAnimation` true, with `lost` false. Sampled frames showed no Codex pointer; the pointer returned after recording stopped. The 93.771-second source exported to 18.4 seconds. An unrelated automatic editing hold reported a missing pre-edit frame at 89.612 seconds.

A separate unsuppressed control (`artifacts/b4df86d7-bb35-43a3-b533-2583fa8982c9`) disabled Repro's own pointer and confirmed Codex's pointer visible on foreground clicks, absent during background clicks/typing, and visible again after returning to the tab. This establishes the observed behavior, not the internal reason Codex hides its overlay. The browser UI confirmed the selected tab at each transition. `document.visibilityState` remained `visible` during this tab capture even while another tab was selected, so it is not a reliable focus signal here.

All 82 tests and lint passed before the live test. Unit coverage includes unknown-layout fallback, failed style verification, cursor/root replacement, visibility transitions, restoration, and sticky failure. Claude and other harnesses have not been tested live. Internal Codex selectors may change. Eligibility only verifies the recognized DOM overlay, not every possible native or third-party cursor. If suppression fails mid-clip, skipping animated export cannot restore a cursor already hidden in earlier frames; that outcome needs a warning or a new recording. Cleanup on navigation, extension reload, and recording-start failure needs further hardening before this experiment becomes the default.


## Exported cursor animation (0.11.0, November 16)

Cursor reconstruction is now enabled by default for clips with verified Codex cursor suppression. Exports use a 30fps pointer with minimum-jerk easing, direct target-to-target paths, and distance-based travel duration. Rapid actions receive additional playback holds. Multiple pointerdown events within one source frame are replayed in order over a shared recorded backdrop, with a warning that intermediate application states are unavailable. Actual drag samples retain their paths. Unknown or failed suppression disables reconstruction; preserveTiming disables added travel holds. The manifest records synthesized movements, clicks, hold provenance, and duration.

Live clip `artifacts/ca270f64-e1dc-4b16-9f4b-eaaddb284da2` contains eight clicks and sequential text entry, with foreground → background → foreground transitions. Tab activity changed at 23.432 and 31.024 source seconds. Suppression remained verified throughout, with no warnings. The 36.794-second capture exported to 11.933 seconds, including 2.133 seconds of cursor travel holds and 0.467 seconds of editing holds. The final clip was inspected for pointer visibility, click alignment, and eased motion. The original Codex pointer returned after stop; the capture session remains enabled.

The first live export exposed a single-image lifetime issue with multiple overlay inputs and a frame synchronization issue with FFmpeg sendcmd. Overlay images now loop with explicit shortest-stream termination; pointer and ring positions are evaluated from output timestamps rather than mutable filter commands. Regression encoding checks verify pointer pixels at arrival, during acceleration/deceleration, and late in a clip containing editing overlays. Focus-transition checks are live; same-frame click ordering, drag preservation, unknown-harness fallback, and invalidation cleanup are covered by automated tests. Other browser harnesses remain unvalidated.


### Composer synchronization follow-up

The composer recording exposed a highlight that returned to First name after the cursor moved to Last name. Highlight afterglow previously extended until the next input event, survived a cursor hold as two disjoint intervals, and used sub-frame boundaries even though source footage is 15fps. Highlights now end on focus leaving a field; field transitions align to source-frame boundaries. At a shared insertion point, cursor travel precedes the automatic reading hold. Clicks immediately followed by text input also receive a 0.2-second arrival pause, preserving a visible click-before-typing sequence without changing browser input timing.

Re-exported the unchanged source in `artifacts/a830bb0c-caa0-4611-b4fe-20907a3a090f`. Frame inspection confirmed a blank First name field during arrival, typing afterward, and Last name highlighted from its first visible T without the old First name box returning. The corrected clip is 33.467 seconds. Regression tests check highlight ownership across holds and encoded pixels on the first changed frame, plus click-to-input arrival timing. These are exporter-only changes; no extension reload is required.


### Codex overlay as a movement source (0.11.1, investigation pending)

The opt-in `cursorOverlayProbe` now also records timestamped cursor transforms, opacity, geometry, and initial ancestor layout from the recognized closed shadow root. It samples changes while the cursor is hidden, with a 30Hz check and mutation observations, a 20,000-entry cap, and an explicit truncation flag. Metadata includes captureStartedAt to align these observations with page pointer events. Normal recordings retain their current movement source and do not collect this diagnostic geometry.

All 97 tests and lint pass. Live validation still needs to establish whether Codex updates the overlay independently of physical mouse movement, whether hidden/background movement remains observable, and whether hover-only actions can be identified. Suppression alone does not prove the overlay is a reliable movement source. No automatic tab backgrounding was added.


### Live overlay-source comparison (0.11.1)

Capture `artifacts/ca9572ca-749c-4f8b-8fdf-cf09334be209` compared Codex Playwright clicks with native-app mouse clicks on the composer, then backgrounded and restored the recorded tab. Suppression remained verified, and 467 pose observations were retained without truncation.

In the foreground, the hidden Codex element continued changing its inline transform. Its translation plus (12,12) matched the three agent click coordinates. Native mouse movement and two native clicks did not move this overlay: the 10–15.23 second interval contained 51 page pointer events and zero new overlay poses. This supports using the overlay as an agent-specific foreground movement source. Its animated transform includes rotation, scaling, and intermediate travel positions; it is a rendered trajectory, not a raw input log. Computed transform was `none` under suppression; inline transform retained the coordinates.

The tab became inactive at 15.231 seconds. Codex faded its overlay out but then left its position stale during two background clicks (20.869 and 21.135 seconds). Page pointer events still recorded both coordinates. Restoring the tab at 25.482 seconds updated the overlay directly to the last background target, and subsequent foreground clicks updated it normally. Therefore the overlay alone cannot supply background movements. A candidate design is overlay-derived foreground motion and page-derived background motion, using Chrome tab/window activity rather than document.visibilityState. This needs implementation and transition coverage before replacing the existing source.

Hover-only agent input remains unvalidated: the currently exposed browser-use API offers no hover/mouse-move operation. Native mouse comparison establishes source separation for the tested foreground clicks and physical movement, not a universal automation provenance guarantee. No normal recording behavior changed, and the approved capture session was retained.


### Hybrid cursor attribution (0.11.2, live recording pending)

Normal animated captures now retain compact Codex overlay positions without the full diagnostic layout payload. The exporter selects overlay-confirmed foreground page events and all inactive-tab pointer events before planning cursor motion. Exact click times and button state remain intact; existing smooth travel and reading holds still apply. Unknown transforms or exhausted telemetry invalidate tracking and disable animation with a warning.

All 105 tests and lint pass. Replaying the prior comparison telemetry through this selector retained all five agent clicks (three foreground, two background), rejected both native clicks, and excluded 86 total unrelated pointer samples. Tests cover foreground interference, stale background overlays, foreground return, repeated clicks, event-delivery skew, invalid tracking, legacy exports, and rapid-click timing. A new live recording with the updated extension remains to be run after reload.


### Live hybrid comparison (0.11.2)

Recorded `artifacts/d722a53b-18b0-4354-9f4a-016e83487cc9` with the same comparison sequence: agent selects Alex and clicks Last name; native mouse clicks First name and Subject; recorded tab becomes inactive; agent selects Jordan and clicks fallback in the background; tab returns to the foreground; agent clicks Message. Native Chrome UI verified the selected tab at both transitions.

The 35.897-second source exported to 9.667 seconds. Suppression and tracking stayed valid, with no warnings. Cursor reconstruction retained exactly five agent clicks: three confirmed by the foreground overlay and two from background page events. It excluded 15 unrelated pointer samples, including the two native click sequences. Frame inspection confirmed a single pointer, visible background clicks, and no movement toward the native-click targets. The actual field-focus changes caused by native clicks remain visible in the source; cursor filtering does not prevent physical input from affecting the app. Capture remains enabled.

An earlier interrupted take (`artifacts/de7ae88a-4202-4fd9-9ad6-f8336be6af9a`) was stopped when concurrent browser use prevented foreground selection. It separately confirmed both background clicks were retained.


### Full annotated composer reproduction (0.11.2)

Capture `artifacts/85e9ce46-2ae2-4b79-977b-4bd125ffd8ad` repeats the original composer sequence: fallback there, select Lee, type Jordan/Taylor, annotate unchanged saved greeting, undo/redo, choose Formal, edit subject and message using Tab, include contact number, save, annotate updated greeting, then switch away and back to verify persistence. Both three-second callouts use the original labels.

The 65.564-second source exported to 27.467 seconds, retaining nine clicks, keyboard badges, editing highlights, and both annotations without warnings. This run stayed in an inactive tab and therefore exercised the background page-event source (27 samples); foreground attribution was validated in the preceding comparison. Full storyboard and 8fps close-ups of the name fields confirmed the initial click precedes typing and the editing box transfers to Last name without returning to First name. Capture remains enabled.


### Focus and lifecycle hardening (0.11.2)

Live app-switch capture `artifacts/5483ed3e-7d88-46d4-9e05-b14cbef34b32` retained all three agent clicks around leaving Chrome, using Finder, and returning to Chrome. The unrelated page click was excluded. The recognized overlay remained readable for the active tab in this case; window focus alone did not require a new source.

A separate Chrome-window test (`artifacts/beb8a1ec-9a5d-4993-9bb4-2ec596be1045`) found a real attribution bug. Opening a tab in another window broadcasts an unchanged active:true for the captured tab. The exporter incorrectly reset its activation boundary, discarding the next repeated click at the same stationary overlay position. It now resets the boundary only when active actually changes. A regression test covers this; re-exporting the same unmodified capture retains all five clicks rather than four. Frame inspection confirmed cursor/ring rendering. Two immediate clicks correctly produce the existing shared-backdrop warning. The temporary second Chrome window was closed afterward.

Additional live checks:
- Reload during recording: `artifacts/23759048-508d-492f-80f0-03e3356370d2` saves the clip and explicitly warns that suppression was lost; it disables reconstructed animation. A fresh capture after reload works on the same approved session.
- Automatic two-second limit: `artifacts/ddf717d2-02ec-4ca3-a006-8bc96c0fa380` stops, reports completed:true, and exports successfully (2.005 seconds source).
- preserveTiming: `artifacts/c2e588a0-d9d9-4e70-ae88-a1286b7a3cf1` retains both clicks and all 27.876 source seconds with no idle cuts or automatic/cursor holds.
- Cropped screenshot after these cycles: `artifacts/c5520b47-7ccc-4258-aad3-294852118894` shows aligned First name/Last name boxes and non-overlapping labels. An unsupported implicit-region role target returned a recoverable error; explicit selectors succeeded on the same session.
- Managed service restart preserved the extension's approved session and subsequent capture worked without another REC click.

All 106 tests and lint pass, including the new regression. The exporter fix is running in the managed service; no extension reload was necessary. These checks establish the current Codex/macOS path, not compatibility with other harnesses. Reload/navigation mid-clip remains a documented cursor-animation limitation.
