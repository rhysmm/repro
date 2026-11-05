export class Sessions {
  #sessions = new Map();
  #tabs = new Map();
  constructor(factory) { this.factory = factory; }
  create(tabId) {
    if (this.#tabs.has(tabId)) throw new Error('This tab already belongs to a capture session. Reuse its sessionId or choose another tab.');
    const sessionId = crypto.randomUUID();
    const entry = { sessionId, tabId, recorder: this.factory(sessionId, tabId), busy: false };
    this.#sessions.set(sessionId, entry);
    this.#tabs.set(tabId, sessionId);
    return entry;
  }
  get(sessionId) {
    const entry = this.#sessions.get(sessionId);
    if (!entry) throw new Error('Unknown sessionId. Use the handle returned by capture_start.');
    return entry;
  }
  remove(sessionId) {
    const entry = this.get(sessionId);
    this.#sessions.delete(sessionId);
    this.#tabs.delete(entry.tabId);
  }
  counts() {
    const all = [...this.#sessions.values()];
    return { sessions: all.length, enabled: all.filter(s => s.recorder.status().enabled).length, recording: all.filter(s => s.recorder.status().recording).length };
  }
  async run(sessionId, action) {
    const entry = this.get(sessionId);
    if (entry.busy) throw new Error('Another operation is in progress for this session.');
    entry.busy = true;
    try { return await action(entry); }
    finally { entry.busy = false; }
  }
}
