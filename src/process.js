import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { planTimeline } from './timeline.js';
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
export async function processVideo(directory, metadata) {
  const raw = path.join(directory, 'original.webm');
  const probe = JSON.parse(await run('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', raw]));
  const stream = probe.streams.find(s => s.codec_type === 'video');
  const probed = Number(probe.format.duration);
  const duration = Number.isFinite(probed) ? Math.min(probed, metadata.duration) : metadata.duration;
  const timeline = planTimeline(duration, metadata.samples, metadata.events, metadata.preserveTiming);
  const args = ['-y', '-v', 'error', '-i', raw];
  const filters = [];
  for (let index = 0; index < timeline.length; index++) {
    const segment = timeline[index];
    filters.push(`[0:v]trim=start=${segment.start}:end=${segment.end},setpts=PTS-STARTPTS,fps=15[out${index}]`);
  }
  filters.push(`${timeline.map((_, i) => `[out${i}]`).join('')}concat=n=${timeline.length}:v=1:a=0,format=yuv420p[final]`);
  const output = path.join(directory, 'clip.mp4');
  args.push('-filter_complex', filters.join(';'), '-map', '[final]', '-an', '-c:v', 'libx264', '-preset', 'fast', '-crf', '20', '-movflags', '+faststart', output);
  await run('ffmpeg', args);
  const keptSeconds = timeline.reduce((sum, segment) => sum + segment.end - segment.start, 0);
  const manifest = { ...metadata, duration, timeline, keptSeconds, omittedSeconds: duration - keptSeconds, video: { width: stream.width, height: stream.height }, original: raw, clip: output };
  await writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return { clip: output, original: raw, manifest: path.join(directory, 'manifest.json'), durationSeconds: duration, keptSeconds, omittedSeconds: duration - keptSeconds, clickCount: metadata.events.filter(e => ['pointerdown', 'click'].includes(e.type)).length, warnings: metadata.warnings };
}
