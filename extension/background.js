import { approvedTarget } from './approval-state.js';
let enabledTab, creatingOffscreen;
async function offscreen(message) {
  return chrome.runtime.sendMessage({ destination: 'offscreen', ...message });
}
async function inject(tabId) {
  await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
}
async function ensureOffscreen() {
  if (creatingOffscreen) return creatingOffscreen;
  creatingOffscreen = (async () => {
    const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
    if (!contexts.length) await chrome.offscreen.createDocument({ url: 'offscreen.html', reasons: ['USER_MEDIA', 'DISPLAY_MEDIA', 'BLOBS'], justification: 'Receive agent capture requests and record only after browser approval.' });
  })();
  try { await creatingOffscreen; }
  finally { creatingOffscreen = undefined; }
}
chrome.runtime.onInstalled.addListener(() => { ensureOffscreen(); });
chrome.runtime.onStartup.addListener(() => { ensureOffscreen(); });
ensureOffscreen();

async function enable(tab) {
  const generated = await fetch(chrome.runtime.getURL('config.js')).catch(error => {
    if (error instanceof TypeError) throw new Error('Load chrome-evidence/dist/extension, not the source extension folder.');
    throw error;
  });
  if (!generated.ok) throw new Error('Load chrome-evidence/dist/extension, not the source extension folder.');
  if (!/^https?:/.test(tab.url || '')) throw new Error('Open a normal HTTP or HTTPS page first.');
  await ensureOffscreen();
  const existing = await offscreen({ type: 'status' });
  if (existing?.enabled) throw new Error('A tab is already enabled. Use capture release before enabling another.');
  await inject(tab.id);
  const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id });
  const result = await offscreen({ type: 'enable', streamId, tab: { id: tab.id, title: tab.title, url: tab.url } });
  if (result?.error) throw new Error(result.error);
  enabledTab = tab.id;
  await chrome.storage.session.set({ enabledTab });
  await chrome.action.setBadgeText({ text: 'ON' });
  await chrome.action.setBadgeBackgroundColor({ color: '#2563eb' });
  await chrome.action.setTitle({ title: 'Evidence capture enabled' });
}
chrome.action.onClicked.addListener(tab => {
  enable(tab).catch(async error => {
    await chrome.action.setBadgeText({ text: 'ERR' });
    await chrome.action.setTitle({ title: error.message });
    throw error;
  });
});
chrome.tabs.onUpdated.addListener((tabId, change) => {
  if (change.status !== 'complete') return;
  chrome.storage.session.get('enabledTab').then(async state => {
    if (tabId === state.enabledTab) await inject(tabId);
  }).catch(error => offscreen({ type: 'warning', message: `Page instrumentation unavailable: ${error.message}` }));
});
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message.destination !== 'background') return;
  const run = async () => {
    const state = await chrome.storage.session.get('enabledTab');
    if (message.type === 'requestCapture') {
      const options = message.options;
      const stored = await chrome.storage.session.get('captureRequest');
      if (stored.captureRequest?.state === 'awaiting_approval') throw new Error('A capture request is already awaiting approval.');
      const requestId = crypto.randomUUID();
      const origin = approvedTarget(options.url, options.url);
      const request = { requestId, origin, tabId: options.tabId, url: options.url, options, state: 'awaiting_approval' };
      await chrome.storage.session.set({ captureRequest: request });
      const window = await chrome.windows.create({ url: chrome.runtime.getURL(`approval.html?requestId=${requestId}`), type: 'popup', width: 560, height: 540 });
      await chrome.storage.session.set({ captureRequest: { ...request, windowId: window.id } });
      return { state: request.state, requestId, tabId: request.tabId, message: 'Approve the capture request in Chrome, then select the requested tab in its sharing picker. Call capture_wait with requestId; do not interact until recording starts.' };
    }
    if (message.type === 'approvalStatus') {
      const { captureRequest } = await chrome.storage.session.get('captureRequest');
      return captureRequest ? { state: captureRequest.state, requestId: captureRequest.requestId, tabId: captureRequest.tabId, error: captureRequest.error, reason: captureRequest.reason } : null;
    }
    if (['approvalDetails', 'approve', 'decline'].includes(message.type)) {
      if (!sender.url?.startsWith(chrome.runtime.getURL('approval.html'))) throw new Error('Approval must come from the extension approval page.');
      const { captureRequest: request } = await chrome.storage.session.get('captureRequest');
      if (!request || request.requestId !== message.requestId) throw new Error('This capture request has expired.');
      if (message.type === 'approvalDetails') return { url: request.url, origin: request.origin };
      if (message.type === 'decline') {
        if (request.state === 'awaiting_approval') await chrome.storage.session.set({ captureRequest: { ...request, state: 'declined', reason: message.reason || 'picker_cancelled' } });
        return { state: 'declined' };
      }
      if (request.state !== 'awaiting_approval') throw new Error('This request is no longer awaiting approval.');
      const target = await chrome.tabs.get(request.tabId);
      approvedTarget(request.url, target.url);
      await inject(target.id);
      await chrome.scripting.executeScript({ target: { tabId: target.id }, func: (handle, permittedOrigin) => {
        if (!navigator.mediaDevices?.setCaptureHandleConfig) throw new Error('This page cannot verify tab sharing. Use HTTPS or localhost.');
        navigator.mediaDevices.setCaptureHandleConfig({ handle, exposeOrigin: false, permittedOrigins: [permittedOrigin] });
      }, args: [request.requestId, chrome.runtime.getURL('').replace(/\/$/, '')] });
      const result = await offscreen({ type: 'enable', source: 'display', expectedHandle: request.requestId, tab: { id: target.id, title: target.title, url: target.url } });
      if (result?.error) {
        await chrome.storage.session.set({ captureRequest: { ...request, state: 'failed', error: result.error } });
        throw new Error(result.error);
      }
      enabledTab = target.id;
      await chrome.storage.session.set({ enabledTab });
      const started = await offscreen({ type: 'approvedStart', options: request.options });
      if (started?.error) {
        await chrome.storage.session.set({ captureRequest: { ...request, state: 'failed', error: started.error } });
        throw new Error(started.error);
      }
      await chrome.storage.session.set({ captureRequest: { ...request, state: 'recording' } });
      await chrome.action.setBadgeText({ text: 'ON' });
      await chrome.action.setTitle({ title: 'Evidence capture enabled' });
      return { state: 'recording' };
    }
    if (message.type === 'event') {
      if (sender.tab?.id !== state.enabledTab) return;
      return offscreen({ type: 'event', event: message.event });
    }
    if (message.type === 'resolve') {
      if (!state.enabledTab) throw new Error('Request capture with tabId and url first.');
      const result = await chrome.tabs.sendMessage(state.enabledTab, { type: 'resolve', options: message.options });
      if (result.error) throw new Error(result.error);
      return result;
    }
    if (message.type === 'released') {
      await chrome.storage.session.remove('enabledTab');
      enabledTab = undefined;
      await chrome.action.setBadgeText({ text: '' });
      await chrome.action.setTitle({ title: 'Enable evidence capture for this tab' });
    }
  };
  run().then(result => respond({ result })).catch(async error => {
    if (message.type === 'approve') {
      const { captureRequest } = await chrome.storage.session.get('captureRequest');
      if (captureRequest?.requestId === message.requestId) await chrome.storage.session.set({ captureRequest: { ...captureRequest, state: 'failed', error: error.message } });
    }
    respond({ error: error.message });
  });
  return true;
});

chrome.windows.onRemoved.addListener(async windowId => {
  const { captureRequest } = await chrome.storage.session.get('captureRequest');
  if (captureRequest?.windowId === windowId && captureRequest.state === 'awaiting_approval') await chrome.storage.session.set({ captureRequest: { ...captureRequest, state: 'declined', reason: 'approval_window_closed' } });
});
