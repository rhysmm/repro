import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
export const root = fileURLToPath(new URL('../', import.meta.url));
export const runtime = path.join(root, '.runtime');
export const artifacts = path.join(root, 'artifacts');
export async function config() {
  return JSON.parse(await readFile(path.join(runtime, 'config.json'), 'utf8'));
}
