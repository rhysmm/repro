import test from 'node:test';
import assert from 'node:assert/strict';
import { needsPointerOverlay } from '../extension/pointer.js';
test('background toolbar captures get a pointer while foreground captures avoid duplicates', () => {
  assert.equal(needsPointerOverlay('tab', false), true);
  assert.equal(needsPointerOverlay('tab', true), false);
  assert.equal(needsPointerOverlay('display', false), true);
  assert.equal(needsPointerOverlay('display', true), true);
});
