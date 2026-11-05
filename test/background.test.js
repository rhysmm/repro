import test from 'node:test';
import assert from 'node:assert/strict';
const listeners = {};
const event = name => ({ addListener: fn => { listeners[name] = fn; } });
const stored = {};
const focused = [], forwarded = [], starts = [], badges = new Map();
const tabs = new Map([[1, { id: 1, windowId: 1, active: false, url: 'https://example.com/a' }], [2, { id: 2, windowId: 1, active: true, url: 'https://example.com/b' }]]);
globalThis.chrome = {
  runtime: {
    onInstalled: event('installed'), onStartup: event('startup'), onMessage: event('message'),
    getContexts: async () => [{}], getURL: path => `chrome-extension://test/${path}`,
    sendMessage: async message => {
      forwarded.push(message);
      switch (message.type) {
        case 'approvedStart': starts.push(message.sessionId); return { recording: true };
        default: return {};
      }
    },
  },
  storage: { session: { get: async () => structuredClone(stored), set: async value => Object.assign(stored, structuredClone(value)) } },
  alarms: { create: async () => {}, onAlarm: event('alarm') },
  tabs: {
    get: async id => tabs.get(id), update: async id => { focused.push(id); },
    sendMessage: async id => ({ tabId: id }), onActivated: event('activated'), onUpdated: event('updated'), onRemoved: event('removed'),
  },
  windows: { update: async () => {}, onRemoved: event('windowRemoved') },
  action: { onClicked: event('clicked'), setBadgeText: async ({ tabId, text }) => badges.set(tabId, text), setBadgeBackgroundColor: async () => {}, setTitle: async () => {} },
  scripting: { executeScript: async () => {} },
  tabCapture: { getMediaStreamId: async ({ targetTabId }) => `stream-${targetTabId}` },
};
await import('../extension/background.js');
function send(type, options, sender = {}) {
  return new Promise((resolve, reject) => listeners.message({ destination: 'background', type, options }, sender, response => {
    if (response.error) reject(new Error(response.error)); else resolve(response.result);
  }));
}
async function settled(predicate) {
  for (let i = 0; i < 100 && !predicate(); i++) await new Promise(resolve => setTimeout(resolve, 1));
  assert.ok(predicate(), 'background operation completed');
}
test('two agents queue approval, retain separate routes, and release independently', async () => {
  const [a, b] = await Promise.all([
    send('requestCapture', { sessionId: 'a', tabId: 1, url: tabs.get(1).url, approval: 'toolbar' }),
    send('requestCapture', { sessionId: 'b', tabId: 2, url: tabs.get(2).url, approval: 'toolbar' }),
  ]);
  assert.equal(a.state, 'awaiting_approval'); assert.equal(b.state, 'queued');
  assert.deepEqual(focused, [1]);
  listeners.clicked(tabs.get(1));
  await settled(() => starts.length === 1 && focused.length === 2);
  assert.deepEqual(focused, [1, 2]);
  assert.equal(badges.get(1), 'ON'); assert.equal(badges.get(2), 'REC?');
  listeners.clicked(tabs.get(2));
  await settled(() => starts.length === 2 && badges.get(2) === 'ON');
  assert.deepEqual(starts, ['a', 'b']);
  assert.deepEqual(await send('resolve', { sessionId: 'a' }), { tabId: 1, tabActive: false });
  assert.deepEqual(await send('resolve', { sessionId: 'b' }), { tabId: 2, tabActive: true });
  await new Promise(resolve => listeners.message({ destination: 'background', type: 'event', event: { type: 'click', x: 10 } }, { tab: { id: 2 } }, resolve));
  assert.equal(forwarded.at(-1).sessionId, 'b');
  await assert.rejects(send('resolve', { sessionId: 'unknown' }), /not enabled/);
  await listeners.activated();
  assert.deepEqual(forwarded.filter(m => m.type === 'tabActivity'), [
    { destination: 'offscreen', type: 'tabActivity', sessionId: 'a', active: false },
    { destination: 'offscreen', type: 'tabActivity', sessionId: 'b', active: true },
  ]);
  await send('released', { sessionId: 'a' });
  assert.equal(badges.get(1), ''); assert.equal(badges.get(2), 'ON');
  assert.deepEqual(await send('resolve', { sessionId: 'b' }), { tabId: 2, tabActive: true });
  assert.equal((await send('approvalStatus', { sessionId: 'b' })).state, 'recording');
});
