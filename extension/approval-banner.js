// This function is serialized by chrome.scripting; keep it self-contained.
export function updateApprovalBanner(request, visible) {
  const key = '__chromeEvidenceApprovalNotice';
  const existing = globalThis[key];
  if (!visible) {
    if (existing?.requestId === request.requestId) existing.remove();
    return { shown: false };
  }
  if (location.href !== request.url || Date.now() >= request.expiresAt) return { shown: false, reason: 'page_changed_or_expired' };
  existing?.remove();
  const host = document.createElement('div');
  host.setAttribute('data-chrome-evidence-approval', '');
  host.style.cssText = 'all:initial!important;position:fixed!important;top:16px!important;right:20px!important;width:min(390px,calc(100vw - 40px))!important;z-index:2147483647!important;display:block!important;pointer-events:none!important;color-scheme:light!important;';
  const shadow = host.attachShadow({ mode: 'closed' });
  const style = new CSSStyleSheet();
  style.replaceSync(`
    :host{all:initial} *{box-sizing:border-box}
    .notice{position:relative;background:#fff;color:#172033;border:2px solid #2563eb;border-radius:16px;padding:22px 22px 18px;box-shadow:0 12px 40px #17203340;font:15px/1.5 system-ui,-apple-system,sans-serif;pointer-events:auto;text-align:left}
    .eyebrow{display:flex;align-items:center;gap:8px;color:#1d4ed8;font-size:12px;font-weight:750;letter-spacing:.06em;text-transform:uppercase}
    .dot{height:8px;width:8px;border-radius:50%;background:#2563eb;flex:none}
    h2{font-size:21px;line-height:1.25;letter-spacing:-.025em;margin:14px 0 10px;font-weight:750}
    p{margin:0 0 12px;color:#475569} strong{color:#172033;font-weight:700}
    .rec{display:inline-block;border-radius:4px;background:#b45309;color:white;padding:0 5px;font:700 12px/1.6 system-ui;vertical-align:1px}
    .notice>:not(.arrow){position:relative;z-index:1}
    .arrow{position:absolute;right:64px;top:8px;width:190px;height:250px;color:#2563eb;opacity:.12;pointer-events:none;z-index:0}
    .foot{display:flex;align-items:center;justify-content:space-between;gap:12px;border-top:1px solid #e2e8f0;padding-top:12px;margin-top:16px}
    .waiting{font-size:12px;color:#64748b} button{font:600 13px system-ui;color:#334155;background:#f1f5f9;border:1px solid #cbd5e1;border-radius:7px;padding:7px 11px;cursor:pointer;white-space:nowrap}
    button:hover{background:#e2e8f0} button:focus-visible{outline:3px solid #2563eb;outline-offset:3px}
    @media(prefers-reduced-motion:no-preference){.notice{animation:appear .2s ease-out}@keyframes appear{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}}
  `);
  shadow.adoptedStyleSheets = [style];
  const notice = document.createElement('section');
  notice.className = 'notice';
  notice.setAttribute('role', 'status');
  notice.setAttribute('aria-live', 'polite');
  notice.setAttribute('aria-label', 'Chrome Evidence capture approval');
  const element = (tag, className, text) => {
    const node = document.createElement(tag);
    node.className = className;
    if (text) node.textContent = text;
    return node;
  };
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'arrow'); svg.setAttribute('viewBox', '0 0 190 250');
  svg.setAttribute('fill', 'currentColor'); svg.setAttribute('aria-hidden', 'true');
  const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  arrow.setAttribute('d', 'M95 8L175 88H125V238H65V88H15Z');
  svg.append(arrow);
  const eyebrow = element('div', 'eyebrow');
  eyebrow.append(element('span', 'dot'), 'Chrome Evidence');
  const instruction = element('p', '');
  instruction.append('Click the pinned ', element('strong', '', 'Chrome Evidence'), ' extension marked ', element('span', 'rec', 'REC?'), ' in the toolbar above.');
  const foot = element('div', 'foot');
  const cancel = element('button', '', 'Not now'); cancel.type = 'button';
  foot.append(element('span', 'waiting', 'Waiting for your approval'), cancel);
  notice.append(svg, eyebrow, element('h2', '', 'An agent wants to capture this tab'), element('p', '', 'Allow the agent to record clips and save screenshots of this tab.'), instruction, foot);
  shadow.append(notice);
  document.documentElement.append(host);
  let timer;
  const remove = () => {
    clearTimeout(timer); host.remove();
    if (globalThis[key]?.requestId === request.requestId) delete globalThis[key];
  };
  globalThis[key] = { requestId: request.requestId, remove };
  timer = setTimeout(remove, Math.max(0, request.expiresAt - Date.now()));
  cancel.addEventListener('click', async () => {
    const response = await chrome.runtime.sendMessage({ destination: 'background', type: 'bannerDecline', requestId: request.requestId });
    if (response.error) throw new Error(response.error);
    remove();
  });
  return { shown: true };
}

export async function setApprovalBanner(scripting, request, visible) {
  try {
    const results = await scripting.executeScript({ target: { tabId: request.tabId }, func: updateApprovalBanner, args: [{ requestId: request.requestId, url: request.url, expiresAt: request.expiresAt }, visible] });
    return results?.[0]?.result || { shown: false };
  } catch (error) {
    if (/Cannot access contents of|Missing host permission|Cannot access a chrome:|No tab with id|Invalid tab ID|The tab was closed|Frame with ID 0 was removed|Cannot access a chrome-extension:|extensions gallery cannot be scripted/i.test(error.message)) {
      return { shown: false, reason: 'page_unavailable_or_site_access_required', message: 'Chrome could not show the approval banner. Click the REC? toolbar icon to approve. To show banners, allow Chrome Evidence site access in Chrome’s extension settings.' };
    }
    throw error;
  }
}
