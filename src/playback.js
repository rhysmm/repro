export const frameRate = 15;

export function planPlayback(timeline, callouts, duration, holds = [], cursorHolds = []) {
  const totalFrames = Math.ceil(duration * frameRate);
  const points = callouts.map((callout, index) => {
    if (!Number.isFinite(callout.at) || callout.at < 0 || !Number.isFinite(callout.holdSeconds) || callout.holdSeconds < 1 || callout.holdSeconds > 10) throw new Error('Invalid callout timing.');
    return { type: 'callout', index, frame: Math.min(totalFrames, Math.round(callout.at * frameRate)), frames: Math.ceil(callout.holdSeconds * frameRate) };
  });
  points.push(...holds.map((hold, index) => ({ type: 'autoHold', index, sourceFrame: hold.sourceFrame, frame: hold.sourceFrame + 1, frames: Math.ceil(hold.holdSeconds * frameRate) })));
  points.push(...cursorHolds.map((hold, index) => ({ type: 'cursorHold', index, sourceFrame: hold.sourceFrame, frame: hold.frame, frames: Math.ceil(hold.holdSeconds * frameRate) })));
  const priority = { cursorHold: 0, autoHold: 1, callout: 2 };
  points.sort((a, b) => a.frame - b.frame || priority[a.type] - priority[b.type] || a.index - b.index);
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
      append(point.type === 'callout'
        ? { type: 'callout', calloutIndex: point.index, sourceTime: point.frame / frameRate, frames: point.frames }
        : { type: point.type, holdIndex: point.index, sourceFrame: point.sourceFrame, frames: point.frames });
      cursor = frame;
    }
    append({ type: 'video', startFrame: cursor, endFrame: end, frames: end - cursor });
  }
  return segments;
}
