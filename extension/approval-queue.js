const pending = ['queued', 'awaiting_approval', 'starting'];
export class ApprovalQueue {
  constructor(requests = []) { this.requests = requests; }
  add(request) {
    if (this.requests.some(r => r.sessionId === request.sessionId && pending.includes(r.state))) throw new Error('This session already has a pending approval. Use capture_wait.');
    if (this.requests.some(r => r.tabId === request.tabId && (pending.includes(r.state) || r.enabled) && r.sessionId !== request.sessionId)) throw new Error('This tab belongs to another session.');
    this.requests = this.requests.filter(r => r.sessionId !== request.sessionId);
    this.requests.push({ ...request, state: 'queued' });
  }
  get(sessionId) {
    const request = this.requests.find(r => r.sessionId === sessionId);
    if (!request) throw new Error('No approval request for this session.');
    return request;
  }
  current() { return this.requests.find(r => ['awaiting_approval', 'starting'].includes(r.state)); }
  present(now = Date.now()) {
    if (this.current()) return;
    const request = this.requests.find(r => r.state === 'queued');
    if (request) Object.assign(request, { state: 'awaiting_approval', expiresAt: now + 120000 });
    return request;
  }
  expire(now = Date.now()) {
    const current = this.current();
    if (current?.state === 'awaiting_approval' && now > current.expiresAt) {
      current.state = 'expired';
      return current;
    }
  }
  claim(requestId) {
    const request = this.current();
    if (!request || request.requestId !== requestId || request.state !== 'awaiting_approval') throw new Error('This request is no longer awaiting approval.');
    request.state = 'starting';
    return request;
  }
  release(sessionId) {
    const request = this.get(sessionId);
    if (request.state === 'starting') throw new Error('Approval is starting. Wait for it to finish before releasing this session.');
    this.requests = this.requests.filter(r => r !== request);
    return request;
  }
  status(sessionId) {
    const r = this.get(sessionId);
    return { state: r.state, requestId: r.requestId, tabId: r.tabId, error: r.error, queuePosition: r.state === 'queued' ? this.requests.filter(r => pending.includes(r.state)).indexOf(r) + 1 : undefined };
  }
}
