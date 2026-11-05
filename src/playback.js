export const frameRate = 15;

export function planPlayback(timeline, callouts, duration) {
  const totalFrames = Math.ceil(duration * frameRate);
  const points = callouts.map((callout, index) => {
    if (!Number.isFinite(callout.at) || callout.at < 0 || !Number.isFinite(callout.holdSeconds) || callout.holdSeconds < 1 || callout.holdSeconds > 10) throw new Error('Invalid callout timing.');
    return { index, frame: Math.min(totalFrames, Math.round(callout.at * frameRate)), frames: Math.ceil(callout.holdSeconds * frameRate) };
  }).sort((a, b) => a.frame - b.frame || a.index - b.index);
  const segments = []; let outputFrame = 0;
  const append = segment => {
    if (segment.frames <= 0) return;
    segments.push({ ...segment, outputStart: outputFrame / frameRate, outputEnd: (outputFrame + segment.frames) / frameRate });
    outputFrame += segment.frames;
  };
  let pointIndex = 0;
  for (const window of timeline) {
    let cursor = Math.floor(window.start * frameRate);
    const end = Math.min(totalFrames, Math.ceil(window.end * frameRate));
    while (pointIndex < points.length && points[pointIndex].frame <= end) {
      const point = points[pointIndex++];
      const frame = Math.max(cursor, point.frame);
      append({ type: 'video', startFrame: cursor, endFrame: frame, frames: frame - cursor });
      append({ type: 'callout', calloutIndex: point.index, sourceTime: point.frame / frameRate, frames: point.frames });
      cursor = frame;
    }
    append({ type: 'video', startFrame: cursor, endFrame: end, frames: end - cursor });
  }
  return segments;
}
