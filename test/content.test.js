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
  assert.equal(context.__reproInstalled.active, false);
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
  assert.equal(context.__reproInstalled.active, true);
  assert.equal(observers[0].disconnected, false);
});
function keyEvent(key, options = {}) {
  const event = new Event('keydown');
  Object.assign(event, { key, ...options });
  return event;
}
test('page instrumentation sends meaningful shortcut labels but never ordinary typed characters', async () => {
  const messages = [];
  const { document } = page(async message => { messages.push(message.event); });
  for (const event of [keyEvent('a'), keyEvent('7'), keyEvent('A', { shiftKey: true }), keyEvent('Shift'), keyEvent('z', { ctrlKey: true }), keyEvent('Enter'), keyEvent('Tab', { shiftKey: true }), keyEvent('z', { metaKey: true }), keyEvent('é', { altKey: true }), keyEvent('x', { ctrlKey: true, isComposing: true })]) document.dispatchEvent(event);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(messages.map(message => message.keyLabel), [undefined, undefined, undefined, undefined, 'Ctrl+Z', 'Enter', 'Shift+Tab', 'Cmd+Z', undefined, undefined]);
  assert.ok(messages.every(message => !Object.hasOwn(message, 'key') && !Object.hasOwn(message, 'code') && !Object.hasOwn(message, 'data')));
});
test('space is shown for button activation but not ordinary editable text or AltGraph input', async () => {
  const messages = [];
  const { document } = page(async message => { messages.push(message.event); });
  document.dispatchEvent(keyEvent(' ', { composedPath: () => [{ isContentEditable: true }] }));
  document.dispatchEvent(keyEvent(' ', { composedPath: () => [{ closest: () => null }] }));
  document.dispatchEvent(keyEvent('q', { ctrlKey: true, altKey: true, getModifierState: () => true }));
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(messages.map(message => message.keyLabel), [undefined, 'Space', undefined]);
});
