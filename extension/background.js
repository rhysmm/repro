let enabledTab;
async function offscreen(message) {
  return chrome.runtime.sendMessage({ destination: 'offscreen', ...message });
}
async function inject(tabId) {
  await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
}
async function enable(tab) {
  const generated = await fetch(chrome.runtime.getURL('config.js')).catch(error => {
    if (error instanceof TypeError) throw new Error('Load chrome-evidence/dist/extension, not the source extension folder.');
    throw error;
  });
  if (!generated.ok) throw new Error('Load chrome-evidence/dist/extension, not the source extension folder.');
  if (!/^https?:/.test(tab.url || '')) throw new Error('Open a normal HTTP or HTTPS page first.');
  const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  if (!contexts.length) await chrome.offscreen.createDocument({ url: 'offscreen.html', reasons: ['USER_MEDIA', 'BLOBS'], justification: 'Record local evidence from the tab explicitly enabled by the user.' });
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
    if (message.type === 'event') {
      if (sender.tab?.id !== state.enabledTab) return;
      return offscreen({ type: 'event', event: message.event });
    }
    if (message.type === 'resolve') {
      if (!state.enabledTab) throw new Error('Enable a tab using the extension button first.');
      const result = await chrome.tabs.sendMessage(state.enabledTab, { type: 'resolve', options: message.options });
      if (result.error) throw new Error(result.error);
      return result;
    }
    if (message.type === 'released') {
      await chrome.storage.session.remove('enabledTab');
      enabledTab = undefined;
      await chrome.action.setBadgeText({ text: '' });
    }
  };
  run().then(result => respond({ result })).catch(error => respond({ error: error.message }));
  return true;
});
