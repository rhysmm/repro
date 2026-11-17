import test from 'node:test';
import assert from 'node:assert/strict';
import { beginCursorProbe } from '../extension/cursor-probe.js';

test('cursor probe restores the original capture constraints after a supported request', async () => {
  let constraints = { width: 1000, deviceId: 'capture-device' }, cursor = 'motion';
  const original = { width: 1000 };
  const track = { getConstraints: () => constraints, getSettings: () => ({ cursor }), getCapabilities: () => ({ cursor: ['never', 'motion'] }), applyConstraints: async value => { constraints = value; cursor = value.cursor?.exact || 'motion'; } };
  const probe = await beginCursorProbe(track, { cursor: true });
  assert.equal(probe.report.reportsHidden, true);
  assert.deepEqual(constraints, { cursor: { exact: 'never' } });
  await probe.restore();
  assert.deepEqual(constraints, original);
  assert.equal(cursor, 'motion');
});
test('accepting an unknown constraint does not claim that the cursor is hidden', async () => {
  const track = { getConstraints: () => ({}), getSettings: () => ({ cursor: 'motion' }), getCapabilities: () => ({}), applyConstraints: async () => {} };
  const probe = await beginCursorProbe(track, {});
  assert.equal(probe.report.reportsHidden, false);
  assert.equal(probe.report.supportedConstraint, false);
  await probe.restore();
});
test('unsupported cursor constraints are reported, unexpected errors propagate', async () => {
  const track = { getConstraints: () => ({}), getSettings: () => ({}), getCapabilities: () => ({}), applyConstraints: async () => { throw Object.assign(new Error('Unsupported cursor'), { name: 'OverconstrainedError', constraint: 'cursor' }); } };
  const probe = await beginCursorProbe(track, {});
  assert.equal(probe.report.error.name, 'OverconstrainedError');
  assert.equal(probe.report.reportsHidden, false);
  await probe.restore();
  track.applyConstraints = async () => { throw new Error('Unexpected failure'); };
  await assert.rejects(beginCursorProbe(track, {}), /Unexpected failure/);
});
