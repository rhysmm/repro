const near = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) <= 3;

export function selectCursorSource(metadata) {
  const tracking = metadata.cursorSuppression?.tracking;
  if (!metadata.animateCursor || !tracking) return metadata;
  if (!tracking.valid || !Number.isFinite(metadata.captureStartedAt)) {
    return { ...metadata, cursorSuppression: { ...metadata.cursorSuppression, safeForAnimation: false }, cursorSource: { name: 'unavailable' }, warnings: [...(metadata.warnings || []), 'Codex cursor positions could not be verified; animated cursor export was disabled.'] };
  }
  const points = tracking.points.map(point => ({ ...point, t: (point.at - metadata.captureStartedAt) / 1000 })).filter(point => [point.t, point.x, point.y, point.opacity].every(Number.isFinite)).sort((a, b) => a.t - b.t);
  const activity = (metadata.events || []).filter(event => event.type === 'tabActivity').sort((a, b) => a.t - b.t);
  let pointIndex = -1, activityIndex = -1;
  let active = metadata.geometry?.tabActive !== false, activeSince = -Infinity;
  const samples = [...(metadata.pointerSamples || [])].sort((a, b) => a.t - b.t);
  const selected = [];
  let foreground = 0, background = 0;
  for (const sample of samples) {
    while (activityIndex + 1 < activity.length && activity[activityIndex + 1].t <= sample.t) {
      const change = activity[++activityIndex];
      if (change.active !== active) activeSince = change.t;
      active = change.active;
    }
    if ((sample.tabActive ?? active) === false) { selected.push({ ...sample, source: 'background-page' }); background++; continue; }
    while (pointIndex + 1 < points.length && points[pointIndex + 1].t <= sample.t) pointIndex++;
    const matches = point => point && point.t >= activeSince - 0.05 && point.opacity > 0 && near(point, sample);
    let confirmed = matches(points[pointIndex]);
    // Overlay and input events travel independently; allow a small delivery-order skew.
    for (let i = pointIndex + 1; !confirmed && i < points.length && points[i].t <= sample.t + 0.15; i++) confirmed = matches(points[i]);
    if (confirmed) { selected.push({ ...sample, source: 'codex-overlay' }); foreground++; }
  }
  return { ...metadata, pointerSamples: selected, cursorSource: { name: 'codex-overlay-with-background-page-events', foregroundSamples: foreground, backgroundSamples: background, ignoredSamples: samples.length - selected.length } };
}
