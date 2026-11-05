export function planTimeline(duration, samples, events, preserveTiming = false) {
  if (preserveTiming || duration < 3) return [{ start: 0, end: duration, omittedBefore: 0 }];
  const windows = [{ start: 0, end: 0.8 }, { start: duration - 0.6, end: duration }];
  for (const sample of samples) {
    if (sample.changed) windows.push({ start: sample.t - 0.4, end: sample.t + 0.7 });
  }
  for (const event of events) windows.push({ start: event.t - 0.6, end: event.t + 0.7 });
  const sorted = windows.map(w => ({ start: Math.max(0, w.start), end: Math.min(duration, w.end) })).filter(w => w.end > w.start).sort((a, b) => a.start - b.start);
  const merged = [];
  for (const window of sorted) {
    const last = merged.at(-1);
    if (last && window.start - last.end < 0.8) last.end = Math.max(last.end, window.end);
    else merged.push({ ...window });
  }
  return merged.map((window, index) => ({ ...window, omittedBefore: index ? window.start - merged[index - 1].end : 0 }));
}
export function visualChange(previous, current, threshold = 0.004) {
  if (!previous) return true;
  let changed = 0;
  for (let index = 0; index < current.length; index += 4) {
    const delta = Math.max(Math.abs(current[index] - previous[index]), Math.abs(current[index + 1] - previous[index + 1]), Math.abs(current[index + 2] - previous[index + 2]));
    if (delta > 24) changed++;
  }
  return changed / (current.length / 4) >= threshold;
}
