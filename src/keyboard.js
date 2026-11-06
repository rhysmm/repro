export const keyBadgeSeconds = 1.5;
export const keyBurstGap = 0.8;
const escape = text => text.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]);

export function keyboardBursts(events) {
  const bursts = [];
  for (const event of events.filter(event => event.type === 'keydown' && typeof event.keyLabel === 'string' && event.keyLabel.length <= 40).sort((a, b) => a.t - b.t)) {
    let burst = bursts.at(-1);
    if (!burst || event.t - burst.end > keyBurstGap) { burst = { start: event.t, end: event.t, keys: [] }; bursts.push(burst); }
    const last = burst.keys.at(-1);
    if (last?.label === event.keyLabel) last.count++;
    else burst.keys.push({ label: event.keyLabel, count: 1 });
    burst.end = event.t;
  }
  return bursts;
}

function outputTime(t, playback) {
  const videos = playback.filter(segment => segment.type === 'video');
  const segment = videos.find(segment => t >= segment.startFrame / 15 && t < segment.endFrame / 15);
  if (segment) return segment.outputStart + t - segment.startFrame / 15;
  return videos.find(segment => segment.startFrame / 15 >= t)?.outputStart ?? playback.at(-1)?.outputEnd ?? 0;
}

export function planKeyboardBadges(events, playback, frame) {
  const footer = frame.width < 200 || frame.height < 100;
  const width = footer ? Math.max(frame.width, 320) : frame.width;
  const maxBadgeWidth = Math.min(700, width - 16);
  const chars = Math.max(8, Math.floor((maxBadgeWidth - 24) / 8.4));
  const maxLines = footer ? 3 : Math.max(1, Math.min(3, Math.floor((frame.height * 0.4 - 32) / 20)));
  const badges = []; let availableAt = 0;
  for (const burst of keyboardBursts(events)) {
    const tokens = burst.keys.map(key => `${key.label}${key.count > 1 ? ` ×${key.count}` : ''}`);
    const lines = []; let line = '';
    for (const word of tokens.join(' → ').split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (next.length <= chars) { line = next; continue; }
      if (line) { lines.push(line); line = ''; }
      for (const char of word) {
        if (line.length >= chars) { lines.push(line); line = ''; }
        line += char;
      }
    }
    if (line) lines.push(line);
    const pages = Math.ceil(lines.length / maxLines);
    for (let page = 0; page < pages; page++) {
      const rows = lines.slice(page * maxLines, (page + 1) * maxLines);
      const startFrame = Math.ceil(Math.max(outputTime(burst.end, playback), availableAt) * 15);
      const frames = Math.ceil(keyBadgeSeconds * 15);
      const start = startFrame / 15, end = (startFrame + frames) / 15;
      badges.push({ start, end, sourceStart: burst.start, sourceEnd: burst.end, keys: burst.keys, rows, page: page + 1, pages, width: Math.ceil(Math.min(maxBadgeWidth, Math.max(14, ...rows.map(row => row.length)) * 8.4 + 24)), height: 32 + rows.length * 20 });
      availableAt = end;
    }
  }
  const height = footer && badges.length ? frame.height + Math.max(...badges.map(badge => badge.height)) + 16 : frame.height;
  return { badges, width: badges.length ? width : frame.width, height, footer, end: availableAt };
}

export function keyboardBadgeSvg(badge) {
  const title = `Recent keys${badge.pages > 1 ? ` · ${badge.page}/${badge.pages}` : ''}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${badge.width}" height="${badge.height}"><rect width="100%" height="100%" rx="8" fill="#172033" fill-opacity="0.94"/><text x="12" y="18" fill="#b8c6dc" font-family="sans-serif" font-size="11">${escape(title)}</text>${badge.rows.map((line, i) => `<text x="12" y="${38 + i * 20}" fill="white" font-family="monospace" font-size="14">${escape(line)}</text>`).join('')}</svg>`;
}
