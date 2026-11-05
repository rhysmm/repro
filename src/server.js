import http from 'node:http';
import path from 'node:path';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { WebSocketServer } from 'ws';
import { config, root, artifacts } from './config.js';
import { schemas } from './schema.js';
import { processVideo } from './process.js';
const settings = await config();
await mkdir(artifacts, { recursive: true });
let extension;
const pending = new Map();
const secureEqual = value => typeof value === 'string' && value.length === settings.token.length && timingSafeEqual(Buffer.from(value), Buffer.from(settings.token));
const authorized = request => secureEqual(request.headers.authorization?.replace(/^Bearer /, ''));
function reply(response, code, value) { response.writeHead(code, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(value)); }
async function body(request, limit) {
  const chunks = []; let size = 0;
  for await (const chunk of request) { size += chunk.length; if (size > limit) throw new Error('Request exceeds capture size limit.'); chunks.push(chunk); }
  return Buffer.concat(chunks);
}
function command(name, args) {
  if (!extension || extension.readyState !== 1) throw new Error('Capture extension is not connected. Load or reload dist/extension in Chrome; it connects automatically.');
  const id = randomUUID();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('Capture command timed out; use status to inspect the session.')); }, 180000);
    pending.set(id, { resolve, reject, timer });
    extension.send(JSON.stringify({ id, command: name, args }));
  });
}
const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://127.0.0.1:${settings.port}`);
    if (request.headers.host !== `127.0.0.1:${settings.port}`) return reply(response, 403, { error: 'Invalid host.' });
    if (url.pathname === '/demo' && request.method === 'GET') {
      response.writeHead(200, { 'Content-Type': 'text/html' }); response.end(await readFile(path.join(root, 'demo/index.html'))); return;
    }
    if (!authorized(request)) return reply(response, 401, { error: 'Unauthorized.' });
    if (request.headers.origin && !request.headers.origin.startsWith('chrome-extension://')) return reply(response, 403, { error: 'Browser page requests are not accepted.' });
    if (url.pathname === '/command' && request.method === 'POST') {
      const data = JSON.parse((await body(request, 32000)).toString());
      if (!Object.hasOwn(schemas, data.command)) return reply(response, 400, { error: 'Unknown command.' });
      const args = schemas[data.command].parse(data.args || {});
      return reply(response, 200, await command(data.command, args));
    }
    if (url.pathname === '/upload' && request.method === 'POST') {
      const kind = url.searchParams.get('kind');
      if (!['video', 'screenshot'].includes(kind)) throw new Error('Invalid artifact type.');
      const payload = await body(request, 150 * 1024 * 1024);
      if (payload.length < 4) throw new Error('Invalid capture payload.');
      const metadataLength = payload.readUInt32BE(0);
      if (metadataLength > 1024 * 1024 || metadataLength + 4 >= payload.length) throw new Error('Invalid capture metadata length.');
      const metadata = JSON.parse(payload.subarray(4, 4 + metadataLength).toString());
      const directory = path.join(artifacts, randomUUID()); await mkdir(directory);
      const bytes = payload.subarray(4 + metadataLength);
      if (kind === 'screenshot') {
        const file = path.join(directory, 'screenshot.png'); await writeFile(file, bytes);
        await writeFile(path.join(directory, 'manifest.json'), JSON.stringify(metadata, null, 2));
        return reply(response, 200, { screenshot: file, region: metadata.geometry.region, warnings: metadata.warnings });
      }
      await writeFile(path.join(directory, 'original.webm'), bytes);
      await writeFile(path.join(directory, 'capture.json'), JSON.stringify(metadata, null, 2));
      return reply(response, 200, await processVideo(directory, metadata));
    }
    reply(response, 404, { error: 'Not found.' });
  } catch (error) { reply(response, 400, { error: error.message }); }
});
const wss = new WebSocketServer({ server, maxPayload: 1024 * 1024 });
wss.on('connection', (socket, request) => {
  if (!request.headers.origin?.startsWith('chrome-extension://')) { socket.close(1008, 'Extension required'); return; }
  let authenticated = false;
  const timer = setTimeout(() => socket.close(1008, 'Authentication required'), 3000);
  socket.on('message', bytes => {
    let message;
    try { message = JSON.parse(bytes.toString()); } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      socket.close(1008, 'Invalid message'); return;
    }
    if (!authenticated) {
      if (message.type !== 'hello' || !secureEqual(message.token)) { socket.close(1008, 'Unauthorized'); return; }
      authenticated = true; clearTimeout(timer);
      extension?.close(1000, 'Reconnected'); extension = socket; return;
    }
    const entry = pending.get(message.id);
    if (!entry) return;
    clearTimeout(entry.timer); pending.delete(message.id);
    if (message.error) entry.reject(new Error(message.error)); else entry.resolve(message.result);
  });
  socket.on('close', () => {
    clearTimeout(timer);
    if (extension !== socket) return;
    extension = null;
    for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(new Error('Capture extension disconnected.')); }
    pending.clear();
  });
});
server.listen(settings.port, '127.0.0.1', () => console.log(`Chrome Evidence listening on http://127.0.0.1:${settings.port}\nDemo: http://127.0.0.1:${settings.port}/demo`));
