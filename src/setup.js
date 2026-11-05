import { mkdir, readFile, writeFile, cp } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { root, runtime } from './config.js';
await mkdir(runtime, { recursive: true, mode: 0o700 });
let settings;
try { settings = JSON.parse(await readFile(path.join(runtime, 'config.json'), 'utf8')); }
catch (error) {
  if (error.code !== 'ENOENT') throw error;
  settings = { port: 47321, token: randomBytes(32).toString('hex') };
}
await writeFile(path.join(runtime, 'config.json'), JSON.stringify(settings), { mode: 0o600 });
await cp(path.join(root, 'extension'), path.join(root, 'dist/extension'), { recursive: true });
await cp(path.join(root, 'src/timeline.js'), path.join(root, 'dist/extension/analysis.js'));
await writeFile(path.join(root, 'dist/extension/config.js'), `export const settings = ${JSON.stringify(settings)};\n`, { mode: 0o600 });
console.log(`Extension: ${path.join(root, 'dist/extension')}\nDemo: http://127.0.0.1:${settings.port}/demo\nManaged installation: npm run install:local (macOS). Manual service: npm start`);
