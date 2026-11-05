import { spawn } from 'node:child_process';
import { writeFile, readFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { planTimeline } from './timeline.js';
import { planPlayback, frameRate } from './playback.js';
export function run(binary, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-8000); });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve(stdout) : reject(new Error(`${binary} exited ${code}: ${stderr}`)));
  });
}
export async function processVideo(directory, metadata, { calloutRoot = path.dirname(directory) } = {}) {
  const raw = path.join(directory, 'original.webm');
  const probe = JSON.parse(await run('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', raw]));
  const stream = probe.streams.find(s => s.codec_type === 'video');
  const probed = Number(probe.format.duration);
  const duration = Number.isFinite(probed) ? Math.min(probed, metadata.duration) : metadata.duration;
  const timeline = planTimeline(duration, metadata.samples, metadata.events, metadata.preserveTiming, metadata.callouts);
  const callouts = metadata.callouts || [];
  if (callouts.length > 20) throw new Error('A clip can contain at most 20 callouts.');
  const playback = planPlayback(timeline, callouts, duration);
  const args = ['-y', '-v', 'error', '-i', raw];
  for (const [index, callout] of callouts.entries()) {
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(callout.calloutId || '')) throw new Error('Invalid callout image ID.');
    const imageDirectory = path.join(calloutRoot, callout.calloutId);
    const imageMetadata = JSON.parse(await readFile(path.join(imageDirectory, 'manifest.json'), 'utf8'));
    if (!metadata.sessionId || imageMetadata.sessionId !== metadata.sessionId) throw new Error('The callout image belongs to another capture session.');
    const image = path.join(directory, `callout-${index + 1}.png`);
    await copyFile(path.join(imageDirectory, 'screenshot.png'), image);
    args.push('-loop', '1', '-framerate', String(frameRate), '-i', image);
  }
  const filters = playback.map((segment, index) => segment.type === 'video'
    ? `[0:v]fps=${frameRate},trim=start_frame=${segment.startFrame}:end_frame=${segment.endFrame},setpts=PTS-STARTPTS,setsar=1,format=yuv420p[out${index}]`
    : `[${segment.calloutIndex + 1}:v]scale=${stream.width}:${stream.height}:force_original_aspect_ratio=decrease,pad=${stream.width}:${stream.height}:(ow-iw)/2:(oh-ih)/2:color=white,trim=end_frame=${segment.frames},setpts=PTS-STARTPTS,setsar=1,format=yuv420p[out${index}]`);
  filters.push(`${playback.map((_, i) => `[out${i}]`).join('')}concat=n=${playback.length}:v=1:a=0,format=yuv420p[final]`);
  const output = path.join(directory, 'clip.mp4');
  args.push('-filter_complex', filters.join(';'), '-map', '[final]', '-an', '-c:v', 'libx264', '-preset', 'fast', '-crf', '20', '-movflags', '+faststart', output);
  await run('ffmpeg', args);
  const keptSeconds = timeline.reduce((sum, segment) => sum + segment.end - segment.start, 0);
  const insertedSeconds = playback.filter(segment => segment.type === 'callout').reduce((sum, segment) => sum + segment.frames / frameRate, 0);
  const outputDurationSeconds = Number(await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', output]));
  const manifest = { ...metadata, duration, timeline, playback, keptSeconds, insertedSeconds, outputDurationSeconds, omittedSeconds: duration - keptSeconds, video: { width: stream.width, height: stream.height }, original: raw, clip: output };
  await writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return { clip: output, original: raw, manifest: path.join(directory, 'manifest.json'), durationSeconds: duration, keptSeconds, insertedSeconds, outputDurationSeconds, calloutCount: callouts.length, omittedSeconds: duration - keptSeconds, clickCount: metadata.events.filter(e => ['pointerdown', 'click'].includes(e.type)).length, warnings: metadata.warnings };
}
