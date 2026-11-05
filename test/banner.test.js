import test from 'node:test';
import assert from 'node:assert/strict';
import { setApprovalBanner } from '../extension/approval-banner.js';
test('withheld site access leaves toolbar approval available and reports the limitation', async () => {
  const result = await setApprovalBanner({ executeScript: async () => { throw new Error('Cannot access contents of url https://example.com/. Extension manifest must request permission to access this host.'); } }, { tabId: 1 }, true);
  assert.equal(result.shown, false);
  assert.match(result.message, /REC\?/);
});
test('unexpected banner failures are surfaced', async () => {
  await assert.rejects(setApprovalBanner({ executeScript: async () => { throw new Error('Unexpected script error'); } }, { tabId: 1 }, true), /Unexpected script error/);
});
