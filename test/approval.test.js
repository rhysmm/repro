import test from 'node:test';
import assert from 'node:assert/strict';
import { approvedTarget, verifyCaptureHandle } from '../extension/approval-state.js';
import { schemas } from '../src/schema.js';
test('capture requests bind to an exact tab URL and request only that site', () => {
  assert.equal(approvedTarget('https://app.example.com/path?q=1', 'https://app.example.com/path?q=1'), 'https://app.example.com/*');
  assert.throws(() => approvedTarget('https://app.example.com/path', 'https://app.example.com/other'), /navigated/);
  assert.throws(() => approvedTarget('chrome://extensions', 'chrome://extensions'), /HTTP/);
});
test('a missing or wrong capture handle fails closed', () => {
  assert.throws(() => verifyCaptureHandle('request-a', null), /did not match/);
  assert.throws(() => verifyCaptureHandle('request-a', { handle: 'request-b' }), /did not match/);
  assert.doesNotThrow(() => verifyCaptureHandle('request-a', { handle: 'request-a' }));
});
test('agent requests accept Chrome tab IDs as strings and bound wait duration', () => {
  assert.equal(schemas.start.parse({ tabId: '1234', url: 'https://app.example.com/' }).tabId, 1234);
  assert.throws(() => schemas.wait.parse({ requestId: 'bad-id', seconds: 500 }));
});

test('approval uses the native display picker and verifies the selected tab', async () => {
  const { acquireMedia } = await import('../extension/capture-media.js');
  let options;
  const track = { getCaptureHandle: () => ({ handle: 'requested-tab' }) };
  const stream = { getVideoTracks: () => [track] };
  const devices = { getDisplayMedia: async value => { options = value; return stream; } };
  assert.equal(await acquireMedia(devices, { source: 'display', expectedHandle: 'requested-tab' }), stream);
  assert.equal(options.video.displaySurface, 'browser');
  assert.equal(options.audio, false);
  assert.equal(options.surfaceSwitching, 'exclude');
});

test('selecting a different tab releases every track before reporting failure', async () => {
  const { acquireMedia } = await import('../extension/capture-media.js');
  let stopped = 0;
  const track = { getCaptureHandle: () => ({ handle: 'wrong-tab' }), stop: () => { stopped++; } };
  const stream = { getVideoTracks: () => [track], getTracks: () => [track] };
  await assert.rejects(acquireMedia({ getDisplayMedia: async () => stream }, { source: 'display', expectedHandle: 'requested-tab' }), /did not match/);
  assert.equal(stopped, 1);
});

test('native picker failures retain their original explanation', async () => {
  const { acquireMedia } = await import('../extension/capture-media.js');
  const error = new Error('Permission denied by the browser');
  await assert.rejects(acquireMedia({ getDisplayMedia: async () => { throw error; } }, { source: 'display' }), value => value === error);
});

test('toolbar approval binds the click to the requested tab, URL, and expiry', async () => {
  const { verifyToolbarApproval } = await import('../extension/approval-state.js');
  const request = { approval: 'toolbar', tabId: 42, url: 'https://example.com/test', expiresAt: 2000 };
  assert.doesNotThrow(() => verifyToolbarApproval(request, { id: 42, url: request.url }, 1000));
  assert.throws(() => verifyToolbarApproval(request, { id: 43, url: request.url }, 1000), /Wrong tab/);
  assert.throws(() => verifyToolbarApproval(request, { id: 42, url: 'https://example.com/other' }, 1000), /navigated/);
  assert.throws(() => verifyToolbarApproval(request, { id: 42, url: request.url }, 2001), /expired/);
  assert.throws(() => verifyToolbarApproval({ ...request, approval: 'picker' }, { id: 42, url: request.url }, 1000), /sharing approval/);
});

test('agent requests default to one-click approval and retain the picker alternative', () => {
  assert.equal(schemas.start.parse({}).approval, 'toolbar');
  assert.equal(schemas.start.parse({ approval: 'picker' }).approval, 'picker');
});
