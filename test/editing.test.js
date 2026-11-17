import test from 'node:test';
import assert from 'node:assert/strict';
import { editingBursts, planEditing, fieldRectangle, planEditingOverlays } from '../src/editing.js';
import { planPlayback } from '../src/playback.js';
import { planKeyboardBadges } from '../src/keyboard.js';
const field = (id, y = 40) => ({ id, rect: { x: 30, y, width: 100, height: 30 } });
const input = (t, id = 1) => ({ type: 'input', t, field: field(id) });
const timeline = [{ start: 0, end: 5 }];
const geometry = { region: { x: 20, y: 20, width: 200, height: 120 } };
const frame = { width: 400, height: 240 };

test('selection followed by typing and a field change gets only the missing reading time', () => {
  const events = [{ type: 'pointerdown', t: 2 }, { type: 'pointerdown', t: 2.1, field: field(1) }, input(2.3), input(2.36), input(2.42), input(2.7, 2)];
  const editing = planEditing(events, timeline, [], 5);
  assert.equal(editing.bursts.length, 2);
  assert.equal(editing.holds.length, 2);
  assert.equal(editing.holds[0].reason, 'after-selection');
  assert.equal(editing.holds[0].holdSeconds, 8 / 15);
  assert.equal(editing.holds[1].holdSeconds, 4 / 15);
  assert.ok(editing.holds[0].sourceFrame / 15 < 2.3);
  assert.ok(editing.holds[1].sourceFrame / 15 > 2.42);
});
test('natural pauses, manual callouts, focus without editing, and preserveTiming avoid extra holds', () => {
  assert.equal(planEditing([{ type: 'focusin', t: 1, field: field(1) }], timeline, [], 5).holds.length, 0);
  assert.equal(planEditing([input(1), input(2, 2)], timeline, [], 5).holds.length, 0);
  assert.equal(planEditing([input(0.3)], timeline, [{ at: 0.2, holdSeconds: 3 }], 5).holds.length, 0);
  assert.equal(planEditing([input(0.3)], timeline, [], 5, true).holds.length, 0);
});
test('an uncaptured intermediate state is skipped with a warning', () => {
  const editing = planEditing([{ type: 'pointerdown', t: 2 }, input(2.02)], timeline, [], 5);
  assert.equal(editing.holds.length, 0);
  assert.match(editing.warnings[0], /No distinct pre-edit frame/);
});
test('paste intent supplies pre-edit geometry and later layout changes update the highlight', () => {
  const bursts = editingBursts([{ type: 'paste', t: 1, field: field(1, 80) }, input(1.01), { type: 'editlayout', t: 1.04, field: field(1, 20) }], 5);
  assert.equal(bursts[0].start, 1);
  assert.equal(bursts[0].field.rect.y, 80);
  const overlays = planEditingOverlays({ bursts, holds: [] }, planPlayback(timeline, [], 5), geometry, frame);
  assert.equal(overlays.at(-1).rect.y, 0);
  assert.equal(overlays[0].rect.y, 120);
  assert.deepEqual(fieldRectangle(field(1).rect, geometry, frame), { x: 20, y: 40, width: 200, height: 60 });
  assert.equal(fieldRectangle({ x: 999, y: 0, width: 10, height: 10 }, geometry, frame), undefined);
});
test('automatic holds retain all source frames and shift later keyboard badges and callouts', () => {
  const editing = planEditing([{ type: 'pointerdown', t: 2 }, input(2.3)], timeline, [], 5);
  const playback = planPlayback(timeline, [{ at: 4, holdSeconds: 2 }], 5, editing.holds);
  assert.equal(playback.filter(s => s.type === 'video').reduce((sum, s) => sum + s.frames, 0), 75);
  const hold = playback.find(s => s.type === 'autoHold');
  assert.equal(hold.sourceFrame, 33);
  assert.equal(playback.find(s => s.type === 'callout').outputStart, 4 + 8 / 15);
  const keyboard = planKeyboardBadges([{ type: 'keydown', keyLabel: 'Tab', t: 3 }], playback, frame);
  assert.ok(Math.abs(keyboard.badges[0].start - (3 + 8 / 15)) < 0.001);
  const overlays = planEditingOverlays(editing, playback, geometry, frame);
  assert.equal(overlays[0].label, 'Next: edit');
  assert.equal(overlays[0].start, hold.outputStart);
  assert.equal(overlays[0].end, hold.outputEnd);
});
test('focus changes end the previous highlight before replay holds and the next typed frame', () => {
  const events = [input(1.375), input(1.677), { type: 'pointerdown', t: 2.015, field: field(2, 80) }, { type: 'focusin', t: 2.016, field: field(2, 80) }, { type: 'input', t: 2.055, field: field(2, 80) }];
  const editing = planEditing(events, timeline, [], 5);
  const cursorHold = { sourceFrame: 29, frame: 30, holdSeconds: 0.6 };
  const playback = planPlayback(timeline, [], 5, editing.holds, [cursorHold]);
  const overlays = planEditingOverlays(editing, playback, geometry, frame);
  const hold = playback.find(s => s.type === 'cursorHold');
  assert.ok(overlays.filter(o => o.label === 'Editing' && o.rect.y === 40).every(o => o.end <= hold.outputStart));
  const resumed = playback.find(s => s.type === 'video' && s.startFrame === 30);
  assert.ok(overlays.some(o => o.label === 'Editing' && o.rect.y === 120 && o.start === resumed.outputStart));
  assert.ok(!overlays.some(o => o.label === 'Editing' && o.rect.y === 40 && o.end > resumed.outputStart));
  const nextHold = playback.find(s => s.type === 'autoHold');
  assert.ok(nextHold.outputStart >= hold.outputEnd);
});
