import test from 'node:test';
import assert from 'node:assert/strict';
import { frameContentRect, sourceCrop } from '../extension/frame-geometry.js';

test('letterboxed and pillarboxed frames map viewport coordinates into content, not black bars', () => {
  assert.deepEqual(frameContentRect({ width: 1000, height: 800 }, { width: 1000, height: 600 }), { x: 0, y: 100, width: 1000, height: 600, scale: 1 });
  assert.deepEqual(frameContentRect({ width: 1200, height: 600 }, { width: 1000, height: 600 }), { x: 100, y: 0, width: 1000, height: 600, scale: 1 });
  assert.deepEqual(sourceCrop({ width: 2000, height: 1600 }, { viewport: { width: 1000, height: 600 }, region: { x: 100, y: 200, width: 300, height: 100 } }), { x: 200, y: 600, width: 600, height: 200 });
});
test('matching aspect ratios preserve ordinary crops and invalid frames fail explicitly', () => {
  assert.deepEqual(sourceCrop({ width: 2000, height: 1200 }, { viewport: { width: 1000, height: 600 }, region: { x: 100, y: 200, width: 300, height: 100 } }), { x: 200, y: 400, width: 600, height: 200 });
  assert.throws(() => frameContentRect({ width: 0, height: 0 }, { width: 1000, height: 600 }), /positive dimensions/);
});
