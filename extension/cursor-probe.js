export async function beginCursorProbe(track, supportedConstraints) {
  const previous = track.getConstraints();
  const mutable = Object.fromEntries(Object.entries(previous).filter(([key]) => !['deviceId', 'groupId'].includes(key)));
  const report = {
    requested: 'never',
    supportedConstraint: supportedConstraints.cursor === true,
    capabilities: track.getCapabilities().cursor ?? null,
    before: track.getSettings().cursor ?? null,
  };
  let applied = false;
  try {
    await track.applyConstraints({ cursor: { exact: 'never' } });
    applied = true;
  } catch (error) {
    if (!['OverconstrainedError', 'NotSupportedError'].includes(error.name)) throw error;
    report.error = { name: error.name, message: error.message, constraint: error.constraint };
  }
  report.after = track.getSettings().cursor ?? null;
  report.acceptedConstraint = track.getConstraints().cursor ?? null;
  report.reportsHidden = report.after === 'never';
  return {
    report,
    restore: async () => { if (applied && track.readyState !== 'ended') await track.applyConstraints(mutable); },
  };
}
