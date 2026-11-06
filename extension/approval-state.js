export function approvedTarget(requestedUrl, actualUrl) {
  const expected = new URL(requestedUrl), actual = new URL(actualUrl);
  if (!['https:', 'http:'].includes(expected.protocol)) throw new Error('Capture requires an HTTP or HTTPS page.');
  if (expected.href !== actual.href) throw new Error('The requested tab navigated. Make a new request using its current URL.');
  return `${expected.protocol}//${expected.hostname}/*`;
}
export function verifyCaptureHandle(expected, actual) {
  if (!actual || actual.handle !== expected) throw new Error('The selected tab did not match the requested tab. No recording was started. Request capture again and select the named tab.');
}

export function verifyToolbarApproval(request, tab, now = Date.now()) {
  if (request.approval !== 'toolbar') throw new Error('Use the open sharing approval window for this request.');
  if (now > request.expiresAt) throw new Error('This capture request has expired. Ask the agent to request capture again.');
  if (tab.id !== request.tabId) throw new Error('Wrong tab. Click Repro on the tab selected by the agent. Nothing was recorded.');
  approvedTarget(request.url, tab.url);
}
