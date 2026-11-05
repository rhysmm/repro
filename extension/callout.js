export function prepareCallout(state, canvas, detail, seconds, now = Date.now()) {
  if (!state || state.stopping) throw new Error('Start a recording before adding a callout.');
  if (state.callouts.length >= 20) throw new Error('This clip already has 20 callouts. Start another clip to add more.');
  const scale = Math.min(state.canvas.width / canvas.width, state.canvas.height / canvas.height);
  if (scale < 0.8) throw new Error('This label cannot fit readably in the recording crop. Use a shorter label or start a clip with a larger region.');
  return { ...detail, mode: 'inserted-freeze-frame', at: (now - state.started) / 1000, holdSeconds: seconds };
}
