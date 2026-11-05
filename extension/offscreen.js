import { drawPointer } from './pointer.js';
import { acquireMedia } from './capture-media.js';
import { settings } from './config.js';
import { visualChange } from './analysis.js';
const base = `http://127.0.0.1:${settings.port}`;
let socket, media, tab, video, recording, completed, busy = false;
const warnings = [];
function connect() {
  socket = new WebSocket(`ws://127.0.0.1:${settings.port}`);
  socket.onopen = () => socket.send(JSON.stringify({ type: 'hello', token: settings.token }));
  socket.onmessage = async event => {
    const message = JSON.parse(event.data);
    if (!message.id) return;
    if (busy) { socket.send(JSON.stringify({ id: message.id, error: 'Another capture operation is in progress.' })); return; }
    busy = true;
    try { socket.send(JSON.stringify({ id: message.id, result: await command(message.command, message.args) })); }
    catch (error) { socket.send(JSON.stringify({ id: message.id, error: error.message })); }
    finally { busy = false; }
  };
  socket.onclose = () => setTimeout(connect, 1500);
}
connect();
setInterval(() => { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'heartbeat' })); }, 15000);
async function background(type, options) {
  const response = await chrome.runtime.sendMessage({ destination: 'background', type, options });
  if (response.error) throw new Error(response.error);
  return response.result;
}
function cropFrame(context, geometry) {
  const r = geometry.region;
  const sx = video.videoWidth / geometry.viewport.width;
  const sy = video.videoHeight / geometry.viewport.height;
  context.drawImage(video, r.x * sx, r.y * sy, r.width * sx, r.height * sy, 0, 0, context.canvas.width, context.canvas.height);
}
function canvasFor(geometry) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(2, Math.ceil(geometry.region.width / 2) * 2);
  canvas.height = Math.max(2, Math.ceil(geometry.region.height / 2) * 2);
  return canvas;
}
async function upload(kind, blob, metadata) {
  const encoded = new TextEncoder().encode(JSON.stringify(metadata));
  const prefix = new Uint8Array(4); new DataView(prefix.buffer).setUint32(0, encoded.length);
  const payload = new Blob([prefix, encoded, blob], { type: 'application/octet-stream' });
  const response = await fetch(`${base}/upload?kind=${kind}`, { method: 'POST', headers: { Authorization: `Bearer ${settings.token}`, 'Content-Type': 'application/octet-stream' }, body: payload });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Could not save capture.');
  return result;
}
function status() { return { enabled: Boolean(media), tab, recording: Boolean(recording), completed: Boolean(completed), cursor: media?.getVideoTracks()[0]?.getSettings().cursor, warnings }; }
function requireMedia() { if (!media) throw new Error('Request capture with tabId and url first.'); }
async function command(name, args = {}) {
  if (name === 'status') return { ...status(), approval: await background('approvalStatus') };
  if (name === 'wait') {
    const deadline = Date.now() + args.seconds * 1000;
    let approval = await background('approvalStatus');
    if (approval?.requestId !== args.requestId) throw new Error('Unknown capture request.');
    while (approval.state === 'awaiting_approval' && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 250));
      approval = await background('approvalStatus');
      if (approval?.requestId !== args.requestId) throw new Error('Capture request was replaced.');
    }
    return { ...status(), approval };
  }
  if (name === 'release') {
    if (recording || completed) throw new Error('Finish and retrieve the recording with stop first.');
    media?.getTracks().forEach(track => track.stop());
    media = null; tab = null;
    await background('released');
    return { released: true };
  }
  if (name === 'stop') {
    if (!recording && !completed) throw new Error('No recording to stop.');
    if (recording) await finish();
    const result = await upload('video', completed.blob, { ...completed.metadata, name: args.name });
    completed = null;
    return result;
  }
  if (name === 'start' && !media) {
    if (!args.tabId || !args.url) throw new Error('Provide tabId and url to request capture approval.');
    return background('requestCapture', args);
  }
  requireMedia();
  if (args.tabId && args.tabId !== tab.id) throw new Error('Another tab is enabled. Release it before requesting a new tab.');
  const geometry = await background('resolve', args);
  if (name === 'screenshot') {
    const canvas = canvasFor(geometry);
    const ctx = canvas.getContext('2d');
    cropFrame(ctx, geometry);
    const scaleX = canvas.width / geometry.region.width, scaleY = canvas.height / geometry.region.height;
    for (const h of geometry.highlights) {
      const x = (h.rect.x - geometry.region.x) * scaleX, y = (h.rect.y - geometry.region.y) * scaleY;
      const width = h.rect.width * scaleX, height = h.rect.height * scaleY;
      ctx.strokeStyle = '#ef233c'; ctx.fillStyle = '#ef233c'; ctx.lineWidth = 3;
      if (h.style === 'arrow') {
        const endX = x + width / 2, endY = y + height / 2;
        const startX = Math.max(8, x - 25), startY = Math.max(20, y - 25);
        const angle = Math.atan2(endY - startY, endX - startX);
        ctx.beginPath(); ctx.moveTo(startX, startY); ctx.lineTo(endX, endY);
        ctx.moveTo(endX - 12 * Math.cos(angle - 0.5), endY - 12 * Math.sin(angle - 0.5)); ctx.lineTo(endX, endY); ctx.lineTo(endX - 12 * Math.cos(angle + 0.5), endY - 12 * Math.sin(angle + 0.5)); ctx.stroke();
      } else ctx.strokeRect(x - 3, y - 3, width + 6, height + 6);
      if (h.label) {
        ctx.font = 'bold 14px sans-serif';
        const labelX = Math.max(0, Math.min(x, canvas.width - ctx.measureText(h.label).width - 12));
        const labelY = Math.max(20, y - 6);
        ctx.fillRect(labelX, labelY - 18, ctx.measureText(h.label).width + 12, 22);
        ctx.fillStyle = 'white'; ctx.fillText(h.label, labelX + 6, labelY - 2);
      }
    }
    return upload('screenshot', await new Promise(resolve => canvas.toBlob(resolve, 'image/png')), { name: args.name, geometry, warnings: [...warnings] });
  }
  if (name !== 'start') throw new Error(`Unknown command: ${name}`);
  if (recording || completed) throw new Error('Retrieve the previous recording with stop first.');
  const canvas = canvasFor(geometry), ctx = canvas.getContext('2d');
  const sampleCanvas = document.createElement('canvas'); sampleCanvas.width = 160; sampleCanvas.height = 100;
  const sampleCtx = sampleCanvas.getContext('2d', { willReadFrequently: true });
  cropFrame(ctx, geometry);
  const stream = canvas.captureStream(15);
  const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8'].find(type => MediaRecorder.isTypeSupported(type));
  if (!mimeType) throw new Error('WebM recording is unavailable in this browser.');
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2500000 });
  const state = { canvas, ctx, stream, recorder, chunks: [], started: Date.now(), geometry, args, events: [], samples: [], previous: null, nextSample: 0, warnings: [...warnings] };
  recording = state;
  recorder.ondataavailable = event => { if (event.data.size) state.chunks.push(event.data); };
  state.done = new Promise((resolve, reject) => {
    recorder.onstop = resolve;
    recorder.onerror = event => reject(event.error || new Error('MediaRecorder failed'));
  });
  recorder.start(1000);
  state.timer = setInterval(() => {
    const t = (Date.now() - state.started) / 1000;
    cropFrame(ctx, geometry);
    if (t >= state.nextSample) {
      sampleCtx.drawImage(canvas, 0, 0, 160, 100);
      const current = sampleCtx.getImageData(0, 0, 160, 100).data;
      state.samples.push({ t, changed: visualChange(state.previous, current) });
      state.previous = current; state.nextSample = t + 0.2;
    }
    for (const event of state.events) {
      if (!['pointerdown', 'click'].includes(event.type) || t - event.t < 0 || t - event.t > 0.45) continue;
      const x = (event.x - geometry.region.x) * canvas.width / geometry.region.width;
      const y = (event.y - geometry.region.y) * canvas.height / geometry.region.height;
      ctx.strokeStyle = '#ef233c'; ctx.lineWidth = 2;
      ctx.globalAlpha = 1 - (t - event.t) / 0.45;
      ctx.beginPath(); ctx.arc(x, y, 22 + (t - event.t) * 18, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (state.pointer) drawPointer(ctx, state.pointer, geometry);
    ctx.fillStyle = '#111827cc'; ctx.fillRect(0, canvas.height - 22, 125, 22);
    ctx.fillStyle = 'white'; ctx.font = '12px monospace'; ctx.fillText(`elapsed ${t.toFixed(1)}s`, 8, canvas.height - 7);
  }, 1000 / 15);
  state.limit = setTimeout(() => finish().catch(error => { warnings.push(error.message); throw error; }), args.maxSeconds * 1000);
  return { recording: true, region: geometry.region, viewport: geometry.viewport, maxSeconds: args.maxSeconds, preserveTiming: args.preserveTiming };
}
async function finish() {
  const state = recording;
  if (!state) return;
  clearInterval(state.timer); clearTimeout(state.limit);
  state.recorder.stop();
  await state.done;
  state.stream.getTracks().forEach(track => track.stop());
  completed = { blob: new Blob(state.chunks, { type: state.recorder.mimeType }), metadata: { geometry: state.geometry, duration: (Date.now() - state.started) / 1000, events: state.events, samples: state.samples, preserveTiming: state.args.preserveTiming, pointerRendering: 'reconstructed-from-page-events', warnings: state.warnings } };
  recording = null;
}
chrome.runtime.onMessage.addListener((message, _sender, respond) => {
  if (message.destination !== 'offscreen') return;
  const run = async () => {
    if (message.type === 'status') return status();
    if (message.type === 'event') {
      if (recording) {
        const event = { ...message.event, t: (message.event.at - recording.started) / 1000 };
        if (['pointermove', 'pointerdown', 'click'].includes(event.type)) recording.pointer = event;
        if (event.type === 'pointermove') return;
        const last = recording.events.at(-1);
        if (event.type !== 'scroll' || !last || event.t - last.t > 0.15) recording.events.push(event);
      }
      return;
    }
    if (message.type === 'warning') { warnings.push(message.message); return; }
    if (message.type === 'approvedStart') return command('start', message.options);
    if (message.type === 'enable') {
      const candidate = await acquireMedia(navigator.mediaDevices, message);
      media = candidate;
      tab = message.tab;
      video = document.createElement('video'); video.muted = true; video.srcObject = media;
      await video.play();
      media.getVideoTracks()[0].onended = () => {
        media = null;
        warnings.push('Tab capture ended. Re-enable the tab to continue.');
        if (recording) finish().catch(error => { warnings.push(error.message); throw error; });
      };
      return status();
    }
  };
  run().then(result => respond(result)).catch(error => respond({ error: error.message }));
  return true;
});
