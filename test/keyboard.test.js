import test from 'node:test';
import assert from 'node:assert/strict';
import { keyboardBursts, planKeyboardBadges, keyboardBadgeSvg } from '../src/keyboard.js';
import { planTimeline } from '../src/timeline.js';
import { planPlayback } from '../src/playback.js';
const event = (keyLabel, t) => ({ type: 'keydown', keyLabel, t });
const playback = planPlayback([{ start: 0, end: 10 }], [], 10);

test('rapid keys retain exact order and only consecutive repetitions collapse', () => {
  const bursts = keyboardBursts([event('Tab', 1), event('Enter', 1.01), event('Tab', 1.02), event('Tab', 1.03), event('Tab', 1.04)]);
  assert.deepEqual(bursts[0].keys, [{ label: 'Tab', count: 1 }, { label: 'Enter', count: 1 }, { label: 'Tab', count: 3 }]);
  const result = planKeyboardBadges([event('Tab', 1), event('Enter', 1.01), event('Tab', 1.02)], playback, { width: 968, height: 418 });
  assert.deepEqual(result.badges[0].rows, ['Tab → Enter → Tab']);
  assert.ok(result.badges[0].start >= 1.02);
  assert.ok(result.badges[0].end - result.badges[0].start >= 1.5);
});
test('ordinary input activity never becomes a visible key badge', () => {
  assert.deepEqual(keyboardBursts([{ type: 'input', t: 1 }, { type: 'keydown', t: 2 }]), []);
  assert.equal(planKeyboardBadges([], playback, { width: 320, height: 200 }).badges.length, 0);
});
test('long sequences are paged without dropping keys and queued pages do not overlap', () => {
  const events = Array.from({ length: 40 }, (_, i) => event(`Ctrl+${i}`, i / 100));
  const result = planKeyboardBadges(events, playback, { width: 320, height: 200 });
  assert.ok(result.badges.length > 1);
  const text = result.badges.flatMap(badge => badge.rows).join(' ');
  for (const e of events) assert.ok(text.includes(e.keyLabel));
  for (let i = 1; i < result.badges.length; i++) assert.ok(result.badges[i].start >= result.badges[i - 1].end);
});
test('tiny crops get a readable footer and the last badge can extend beyond the source', () => {
  const result = planKeyboardBadges([event('Ctrl+Z', 9.9)], playback, { width: 100, height: 40 });
  assert.equal(result.footer, true);
  assert.equal(result.width, 320);
  assert.ok(result.height > 40);
  assert.ok(result.end > 10);
});
test('badges follow trimmed playback and callout inserts, with source context retained', () => {
  const events = [event('Tab', 8), event('Enter', 8.01)];
  const callouts = [{ at: 4, holdSeconds: 3 }];
  const timeline = planTimeline(12, [], events, false, callouts);
  assert.ok(timeline.some(segment => segment.start <= 8 && segment.end >= 9.51));
  const segments = planPlayback(timeline, callouts, 12);
  const result = planKeyboardBadges(events, segments, { width: 968, height: 418 });
  const source = segments.find(segment => segment.type === 'video' && segment.startFrame <= 8.01 * 15 && segment.endFrame > 8.01 * 15);
  assert.ok(Math.abs(result.badges[0].start - (source.outputStart + 8.01 - source.startFrame / 15)) < 0.07);
});
test('badge text is escaped before SVG rendering', () => {
  assert.ok(keyboardBadgeSvg({ width: 300, height: 50, rows: ['Ctrl+<'], page: 1, pages: 1 }).includes('Ctrl+&lt;'));
});
