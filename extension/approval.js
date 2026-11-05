const requestId = new URL(location.href).searchParams.get('requestId');
const approve = document.querySelector('#approve'), cancel = document.querySelector('#cancel'), status = document.querySelector('#status');
async function message(type, extra = {}) {
  const response = await chrome.runtime.sendMessage({ destination: 'background', type, requestId, ...extra });
  if (response.error) throw new Error(response.error);
  return response.result;
}
const request = await message('approvalDetails');
document.querySelector('#target').textContent = request.url;
approve.disabled = false;
approve.addEventListener('click', async () => {
  approve.disabled = true;
  try {
    const granted = await chrome.permissions.request({ origins: [request.origin] });
    if (!granted) { await message('decline', { reason: 'site_access_denied' }); status.textContent = 'Site access was declined. Nothing is recording.'; return; }
    status.textContent = 'Select the requested tab in Chrome’s sharing picker.';
    const result = await message('approve');
    if (result.state === 'recording') { window.close(); return; }
    status.textContent = result.error || 'Capture was cancelled.';
    cancel.textContent = 'Close';
  } catch (error) {
    status.textContent = error.message;
    cancel.textContent = 'Close';
    throw error;
  }
});
cancel.addEventListener('click', async () => { await message('decline', { reason: 'user_declined' }); window.close(); });
