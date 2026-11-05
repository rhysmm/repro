import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { processVideo, run } from '../src/process.js';
test('real encoding produces a playable shortened MP4, original, and timing manifest', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'evidence-video-'));
  await run('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=320x240:r=15:d=12', '-c:v', 'libvpx-vp9', path.join(directory, 'original.webm')]);
  const result = await processVideo(directory, { duration: 12, samples: [], events: [{ t: 1, type: 'pointerdown' }, { t: 10, type: 'pointerdown' }], warnings: [] });
  assert.ok(result.omittedSeconds > 5);
  const probe = JSON.parse(await run('ffprobe', ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', result.clip]));
  assert.equal(probe.streams[0].codec_name, 'h264');
  assert.equal(probe.streams[0].width, 320);
  assert.ok(Number(probe.format.duration) < 7);
  const manifest = JSON.parse(await readFile(result.manifest, 'utf8'));
  assert.ok(manifest.timeline[1].omittedBefore > 5);
  assert.equal(result.clickCount, 2);
});
test('preserveTiming output retains the source duration', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'evidence-timing-'));
  await run('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=white:s=320x240:r=15:d=4', '-c:v', 'libvpx-vp9', path.join(directory, 'original.webm')]);
  const result = await processVideo(directory, { duration: 4, samples: [], events: [], warnings: [], preserveTiming: true });
  assert.equal(result.omittedSeconds, 0);
  const duration = Number(await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', result.clip]));
  assert.ok(Math.abs(duration - 4) < 0.2);
});
