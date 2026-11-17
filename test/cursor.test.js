import test from 'node:test';
import assert from 'node:assert/strict';
import { minimumJerk, cursorAnchors, planCursorHolds, planCursor, cursorAt } from '../src/cursor.js';
import { planPlayback } from '../src/playback.js';
const geometry = { region: { x: 100, y: 50, width: 800, height: 400 } };
const frame = { width: 800, height: 400 };
const timeline = [{ start: 0, end: 4 }];
const metadata = samples => ({ animateCursor: true, cursorSuppression: { safeForAnimation: true }, pointerSamples: samples, events: samples, geometry });
const build = data => {
  const holds = planCursorHolds(data, planPlayback(timeline, [], 4)).holds;
  const playback = planPlayback(timeline, [], 4, [], holds);
  return { holds, playback, plan: planCursor(data, playback, geometry, frame, holds) };
};
test('minimum jerk eases in and out with zero endpoint velocity and acceleration', () => {
  assert.equal(minimumJerk(0), 0);
  assert.equal(minimumJerk(1), 1);
  assert.equal(minimumJerk(0.5), 0.5);
  assert.ok(minimumJerk(0.1) < 0.02);
  assert.ok(minimumJerk(0.9) > 0.98);
  assert.ok(minimumJerk(0.001) < 0.000001);
  assert.equal(minimumJerk(-1), 0);
  assert.equal(minimumJerk(2), 1);
});
test('rapid clicks get travel time and exact arrivals in crop coordinates', () => {
  const { holds, plan } = build(metadata([{ t: 1, x: 120, y: 70, type: 'pointerdown' }, { t: 1.1, x: 800, y: 350, type: 'pointerdown' }]));
  assert.equal(holds.length, 1);
  const movement = plan.movements[1];
  assert.ok(movement.end - movement.start >= 0.4);
  assert.deepEqual(cursorAt(plan, movement.end), { x: 700, y: 300 });
  const middle = cursorAt(plan, (movement.start + movement.end) / 2);
  assert.ok(Math.abs(middle.x - 360) < 0.001);
  assert.equal(plan.clicks[1].t, movement.end);
});
test('multiple clicks in one source frame remain ordered and individually visible', () => {
  const samples = [0, 1, 2].map(i => ({ t: 1.01 + i * 0.01, x: 120 + i * 200, y: 100, type: 'pointerdown' }));
  const { holds, plan } = build(metadata(samples));
  assert.equal(holds.length, 3);
  assert.ok(holds.every(h => h.sharedFrame));
  assert.equal(plan.clicks.length, 3);
  assert.ok(plan.clicks[1].t - plan.clicks[0].t > 0.3);
  assert.ok(plan.clicks[2].t - plan.clicks[1].t > 0.3);
  for (const click of plan.clicks) assert.deepEqual(cursorAt(plan, click.t), { x: click.x - 100, y: 50 });
});
test('unknown or lost suppression never enables a replacement cursor', () => {
  const data = metadata([{ t: 1, x: 120, y: 70, type: 'pointerdown' }]);
  data.cursorSuppression.safeForAnimation = false;
  const { holds, plan } = build(data);
  assert.equal(plan.enabled, false);
  assert.deepEqual(holds, []);
});
test('preserveTiming adds no travel holds; real drag paths are retained', () => {
  const data = metadata([{ t: 1, x: 120, y: 70, type: 'pointerdown', buttons: 1 }, { t: 1.2, x: 800, y: 350, type: 'pointermove', buttons: 1 }, { t: 1.3, x: 800, y: 350, type: 'pointerup', buttons: 0 }]);
  assert.equal(build(data).holds.length, 0);
  assert.equal(build(data).plan.movements[1].smooth, false);
  const fast = metadata([{ t: 1, x: 120, y: 70, type: 'pointerdown' }, { t: 1.1, x: 800, y: 350, type: 'pointerdown' }]);
  fast.preserveTiming = true;
  assert.equal(build(fast).holds.length, 0);
});
test('move/down/up at one target become one click without losing release state', () => {
  const anchors = cursorAnchors([{ t: 1, x: 120, y: 70, type: 'pointermove', buttons: 0 }, { t: 1.002, x: 120, y: 70, type: 'pointerdown', buttons: 1 }, { t: 1.004, x: 120, y: 70, type: 'pointerup', buttons: 0 }]);
  assert.equal(anchors.length, 1);
  assert.equal(anchors[0].type, 'pointerdown');
  assert.equal(anchors[0].buttons, 0);
});
test('click immediately followed by typing gets a visible arrival before any typed frames', () => {
  const field = { id: 1 };
  const data = metadata([{ t: 1.359, x: 120, y: 70, type: 'pointerdown' }]);
  data.events = [{ ...data.pointerSamples[0], field }, { t: 1.375, type: 'input', field }];
  const { holds, playback, plan } = build(data);
  assert.equal(holds.length, 1);
  assert.equal(holds[0].arrivalPause, 0.2);
  const hold = playback.find(s => s.type === 'cursorHold');
  assert.ok(hold.outputEnd - plan.clicks[0].t >= 0.199);
  assert.ok(hold.sourceFrame / 15 < data.pointerSamples[0].t);
});
