import { config } from './config.js';
import { schemas } from './schema.js';
export async function capture(command, args = {}) {
  const settings = await config();
  const parsed = schemas[command].parse(args);
  const response = await fetch(`http://127.0.0.1:${settings.port}/command`, { method: 'POST', headers: { Authorization: `Bearer ${settings.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ command, args: parsed }), signal: AbortSignal.timeout(190000) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
  return result;
}
