import test from 'node:test';
import assert from 'node:assert/strict';
import { planTimeline, visualChange } from '../src/timeline.js';
import { schemas } from '../src/schema.js';
test('idle gaps are removed while preserving interaction context and an omission record', () => {
  const timeline = planTimeline(20, [], [{ t: 2, type: 'pointerdown' }, { t: 17, type: 'pointerdown' }]);
  assert.deepEqual(timeline, [{ start: 0, end: 4, omittedBefore: 0 }, { start: 16.4, end: 20, omittedBefore: 12.399999999999999 }]);
});
test('preserveTiming retains real application delays', () => {
  assert.deepEqual(planTimeline(20, [], [], true), [{ start: 0, end: 20, omittedBefore: 0 }]);
});
test('visual changes retain activity without input', () => {
  const samples = Array.from({ length: 40 }, (_, i) => ({ t: i / 2, changed: true }));
  assert.deepEqual(planTimeline(20, samples, []), [{ start: 0, end: 20, omittedBefore: 0 }]);
});
test('tiny changes such as a caret do not prevent idle trimming', () => {
  const first = new Uint8ClampedArray(160 * 100 * 4);
  const second = first.slice(); second.fill(255, 0, 20 * 4);
  assert.equal(visualChange(first, second), false);
  second.fill(255, 0, 100 * 4);
  assert.equal(visualChange(first, second), true);
});
test('region schemas accept unions and reject invalid rectangles', () => {
  assert.equal(schemas.start.parse({ region: [{ testId: 'dialog' }, { role: 'button', name: 'Save' }] }).padding, 24);
  assert.throws(() => schemas.start.parse({ region: { x: 0, y: 0, width: -1, height: 50 } }));
  assert.throws(() => schemas.start.parse({ maxSeconds: 900 }));
});
