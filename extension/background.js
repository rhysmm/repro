import { approvedTarget, verifyToolbarApproval } from './approval-state.js';
import { ApprovalQueue } from './approval-queue.js';
let creatingOffscreen;
let mutations = Promise.resolve();
async function offscreen(message) {
  const response = await chrome.runtime.sendMessage({ destination: 'offscreen', ...message });
  if (response?.error) throw new Error(response.error);
  return response;
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
async function badge(tabId, text, title) {
  try { await chrome.action.setBadgeText({ tabId, text }); }
  catch (error) {
    if (/No tab with id|Invalid tab ID/.test(error.message)) return;
    throw error;
  }
  await chrome.action.setBadgeBackgroundColor({ tabId, color: text === 'REC?' ? '#b45309' : '#2563eb' });
  await chrome.action.setTitle({ tabId, title });
}
function transact(action) {
  const next = mutations.then(async () => {
    const { captureRequests = [] } = await chrome.storage.session.get('captureRequests');
    const queue = new ApprovalQueue(captureRequests);
    try { return await action(queue); }
    finally { await chrome.storage.session.set({ captureRequests: queue.requests }); }
  });
  // The caller receives errors; subsequent independent transactions must still run.
  mutations = next.then(() => undefined, () => undefined);
  return next;
}
async function advance(queue) {
  const expired = queue.expire();
  if (expired) await badge(expired.tabId, '', 'Capture approval expired');
  let request;
  while ((request = queue.present())) {
    try {
      const target = await chrome.tabs.get(request.tabId);
      if (target.url) approvedTarget(request.url, target.url);
      await chrome.tabs.update(target.id, { active: true });
      await chrome.windows.update(target.windowId, { focused: true });
      await badge(target.id, 'REC?', `Approve recording: ${request.url}`);
      if (request.approval === 'picker') {
        const window = await chrome.windows.create({ url: chrome.runtime.getURL(`approval.html?requestId=${request.requestId}`), type: 'popup', width: 560, height: 540 });
        request.windowId = window.id;
      }
      return;
    } catch (error) {
      // Surface presentation failures to the requesting agent and advance the queue.
      Object.assign(request, { state: 'failed', error: error.message });
    }
  }
}
async function initialize() {
  await ensureOffscreen();
  await chrome.alarms.create('approval-expiry', { periodInMinutes: 0.5 });
}
chrome.runtime.onInstalled.addListener(initialize);
chrome.runtime.onStartup.addListener(initialize);
initialize();
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'approval-expiry') return transact(advance);
});
async function approve(request, target) {
  try {
    approvedTarget(request.url, target.url);
    await inject(target.id);
    let capture;
    if (request.approval === 'picker') {
      await chrome.scripting.executeScript({ target: { tabId: target.id }, func: (handle, permittedOrigin) => {
        if (!navigator.mediaDevices?.setCaptureHandleConfig) throw new Error('This page cannot verify tab sharing. Use HTTPS or localhost.');
        navigator.mediaDevices.setCaptureHandleConfig({ handle, exposeOrigin: false, permittedOrigins: [permittedOrigin] });
      }, args: [request.requestId, chrome.runtime.getURL('').replace(/\/$/, '')] });
      capture = { source: 'display', expectedHandle: request.requestId };
    } else capture = { streamId: await chrome.tabCapture.getMediaStreamId({ targetTabId: target.id }) };
    await offscreen({ type: 'enable', sessionId: request.sessionId, ...capture, tab: { id: target.id, title: target.title, url: target.url } });
    // Route geometry and input to this tab before starting its first clip.
    await transact(queue => { queue.get(request.sessionId).enabled = true; });
    await offscreen({ type: 'approvedStart', sessionId: request.sessionId, options: request.options });
    await transact(async queue => {
      queue.get(request.sessionId).state = 'recording';
      await badge(target.id, 'ON', 'Evidence capture enabled for this tab');
      await advance(queue);
    });
    return { state: 'recording' };
  } catch (error) {
    await transact(async queue => {
      Object.assign(queue.get(request.sessionId), { state: 'failed', error: error.message });
      await badge(target.id, 'ERR', error.message);
      await advance(queue);
    });
    throw error;
  }
}
chrome.action.onClicked.addListener(tab => {
  const run = async () => {
    const request = await transact(async queue => {
      await advance(queue);
      const current = queue.current();
      if (!current) return;
      verifyToolbarApproval(current, tab);
      return { ...queue.claim(current.requestId) };
    });
    if (request) await approve(request, tab);
  };
  run().catch(async error => {
    await chrome.action.setTitle({ tabId: tab.id, title: error.message });
    throw error;
  });
});
chrome.tabs.onUpdated.addListener((tabId, change) => {
  if (change.status !== 'complete') return;
  const run = async () => {
    const { captureRequests = [] } = await chrome.storage.session.get('captureRequests');
    const request = captureRequests.find(r => r.tabId === tabId && r.enabled);
    if (!request) return;
    try { await inject(tabId); }
    catch (error) { await offscreen({ type: 'warning', sessionId: request.sessionId, message: `Page instrumentation unavailable: ${error.message}` }); throw error; }
  };
  return run();
});
chrome.tabs.onRemoved.addListener(tabId => transact(async queue => {
  for (const request of queue.requests.filter(r => r.tabId === tabId)) Object.assign(request, { state: 'closed', enabled: false });
  await advance(queue);
}));
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message.destination !== 'background') return;
  const run = async () => {
    if (message.type === 'event') {
      const { captureRequests = [] } = await chrome.storage.session.get('captureRequests');
      const request = captureRequests.find(r => r.tabId === sender.tab?.id && r.enabled);
      if (request) return offscreen({ type: 'event', sessionId: request.sessionId, event: message.event });
      return;
    }
    if (message.type === 'resolve') {
      const { captureRequests = [] } = await chrome.storage.session.get('captureRequests');
      const request = captureRequests.find(r => r.sessionId === message.options.sessionId && r.enabled);
      if (!request) throw new Error('This session is not enabled.');
      const result = await chrome.tabs.sendMessage(request.tabId, { type: 'resolve', options: message.options });
      if (result.error) throw new Error(result.error);
      return result;
    }
    if (message.type === 'requestCapture') return transact(async queue => {
      const options = message.options;
      const origin = approvedTarget(options.url, options.url);
      queue.add({ requestId: crypto.randomUUID(), sessionId: options.sessionId, approval: options.approval, origin, tabId: options.tabId, url: options.url, options });
      await advance(queue);
      return { ...queue.status(options.sessionId), message: 'Approvals are queued. When this tab is selected with REC?, click the pinned Chrome Evidence icon once. Call capture_wait with sessionId and requestId; interact only when recording is true.' };
    });
    if (message.type === 'approvalStatus') return transact(async queue => {
      await advance(queue);
      return queue.status(message.options.sessionId);
    });
    if (message.type === 'released') return transact(async queue => {
      const request = queue.release(message.options.sessionId);
      await badge(request.tabId, '', 'Chrome Evidence');
      await advance(queue);
      return { released: true };
    });
    if (['approvalDetails', 'approve', 'decline'].includes(message.type)) {
      if (!sender.url?.startsWith(chrome.runtime.getURL('approval.html'))) throw new Error('Approval must come from the extension approval page.');
      const request = await transact(async queue => {
        await advance(queue);
        const current = queue.current();
        if (!current || current.requestId !== message.requestId || current.approval !== 'picker') throw new Error('This capture request has expired.');
        if (message.type === 'approve') queue.claim(current.requestId);
        if (message.type === 'decline') {
          if (current.state !== 'awaiting_approval') throw new Error('Approval is already starting.');
          Object.assign(current, { state: 'declined', error: message.reason || 'user_declined' });
          await badge(current.tabId, '', 'Capture declined');
          await advance(queue);
        }
        return { ...current };
      });
      if (message.type === 'approvalDetails') return { url: request.url, origin: request.origin };
      if (message.type === 'decline') return { state: 'declined' };
      return approve(request, await chrome.tabs.get(request.tabId));
    }
    throw new Error(`Unknown background command: ${message.type}`);
  };
  run().then(result => respond({ result })).catch(error => respond({ error: error.message }));
  return true;
});
chrome.windows.onRemoved.addListener(windowId => transact(async queue => {
  const current = queue.current();
  if (current?.windowId === windowId && current.state === 'awaiting_approval') {
    Object.assign(current, { state: 'declined', error: 'approval_window_closed' });
    await badge(current.tabId, '', 'Capture declined');
    await advance(queue);
  }
}));
