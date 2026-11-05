import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareCallout } from '../extension/callout.js';
import { planTimeline } from '../src/timeline.js';
import { planPlayback } from '../src/playback.js';
import { schemas } from '../src/schema.js';
const stateAt = started => ({ started, callouts: [], canvas: { width: 400, height: 200 } });

test('callout preparation returns immediately without reserving or consuming live recording time', () => {
  const state = stateAt(0);
  const result = prepareCallout(state, { width: 400, height: 200 }, { label: 'Unexpected result' }, 10, 29999);
  assert.deepEqual(result, { label: 'Unexpected result', mode: 'inserted-freeze-frame', at: 29.999, holdSeconds: 10 });
  assert.equal(state.callouts.length, 0);
  assert.equal(Object.hasOwn(state, 'hold'), false);
});
test('callouts require an active recording and reject unreadable crops and excess images', () => {
  const frame = { width: 400, height: 200 };
  assert.throws(() => prepareCallout(null, frame, {}, 3), /Start a recording/);
  assert.throws(() => prepareCallout({ ...stateAt(0), stopping: true }, frame, {}, 3), /Start a recording/);
  assert.throws(() => prepareCallout({ ...stateAt(0), callouts: Array(20).fill({}) }, frame, {}, 3), /20 callouts/);
  assert.throws(() => prepareCallout(stateAt(0), { width: 400, height: 500 }, {}, 3), /cannot fit readably/);
});
test('callout points retain surrounding source footage but add reading time only to playback', () => {
  const callouts = [{ at: 10, holdSeconds: 3 }];
  const timeline = planTimeline(20, [], [], false, callouts);
  assert.ok(timeline.some(segment => segment.start < 10 && segment.end > 10));
  assert.ok(timeline.reduce((sum, segment) => sum + segment.end - segment.start, 0) < 3);
  const playback = planPlayback(timeline, callouts, 20);
  const index = playback.findIndex(segment => segment.type === 'callout');
  assert.equal(playback[index].frames, 45);
  assert.equal(playback[index - 1].endFrame, 150);
  assert.equal(playback[index + 1].startFrame, 150);
});
test('multiple callouts at clip boundaries and the same timestamp keep their order and all source frames', () => {
  const callouts = [{ at: 0, holdSeconds: 1 }, { at: 1, holdSeconds: 2 }, { at: 1, holdSeconds: 3 }, { at: 2, holdSeconds: 1 }];
  const playback = planPlayback([{ start: 0, end: 2 }], callouts, 2);
  assert.deepEqual(playback.filter(segment => segment.type === 'callout').map(segment => segment.calloutIndex), [0, 1, 2, 3]);
  assert.equal(playback.filter(segment => segment.type === 'video').reduce((sum, segment) => sum + segment.frames, 0), 30);
  assert.equal(playback.at(-1).outputEnd, 9);
  assert.throws(() => planPlayback([{ start: 0, end: 2 }], [{ at: 0, holdSeconds: 50 }], 2), /Invalid callout timing/);
});
test('callout tool requires a label and session and bounds the exported hold duration', () => {
  const args = { sessionId: '12345678-1234-4234-8234-123456789012', target: { text: 'Unexpected result' }, label: 'This should be saved' };
  assert.equal(schemas.callout.parse(args).holdSeconds, 3);
  assert.throws(() => schemas.callout.parse({ ...args, holdSeconds: 11 }));
  assert.throws(() => schemas.callout.parse({ ...args, label: '' }));
  assert.throws(() => schemas.callout.parse({ target: args.target, label: args.label }));
});
