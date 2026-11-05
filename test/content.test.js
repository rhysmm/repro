import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const source = await readFile(new URL('../extension/content.js', import.meta.url), 'utf8');
function page(sendMessage) {
  const document = new EventTarget();
  document.querySelectorAll = () => [];
  const observers = [];
  const context = vm.createContext({
    document, AbortController,
    addEventListener: () => {},
    MutationObserver: class {
      constructor() { observers.push(this); this.disconnected = false; }
      observe() {}
      disconnect() { this.disconnected = true; }
    },
    chrome: { runtime: { sendMessage, onMessage: { addListener() {} } } },
  });
  vm.runInContext(source, context);
  return { document, context, observers };
}
for (const failure of [
  () => { throw new Error('Extension context invalidated.'); },
  () => Promise.reject(new Error('Extension context invalidated.')),
]) test(`invalidated content listeners stop after ${failure.toString().includes('reject') ? 'asynchronous' : 'synchronous'} failure`, async () => {
  let calls = 0;
  const { document, context, observers } = page(() => { calls++; return failure(); });
  document.dispatchEvent(new Event('pointerdown'));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(context.__chromeEvidenceInstalled.active, false);
  assert.equal(observers[0].disconnected, true);
  document.dispatchEvent(new Event('pointerdown'));
  assert.equal(calls, 1);
});
test('a temporarily missing receiver does not disable page events', async () => {
  let calls = 0;
  const { document, context, observers } = page(() => { calls++; return Promise.reject(new Error('Receiving end does not exist.')); });
  document.dispatchEvent(new Event('pointerdown'));
  await new Promise(resolve => setImmediate(resolve));
  document.dispatchEvent(new Event('pointerdown'));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 2);
  assert.equal(context.__chromeEvidenceInstalled.active, true);
  assert.equal(observers[0].disconnected, false);
});
