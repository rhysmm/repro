import path from 'node:path';
import { homedir } from 'node:os';
import { constants } from 'node:fs';
import { access, mkdir, readFile, writeFile, rename, unlink, chmod, realpath } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { root, runtime, config } from './config.js';
import { launchAgentPlist, mcpConfiguration, updateCodexConfig, installedMcpConfiguration } from './install-config.js';
import { version } from './mcp-tools.js';
if (process.platform !== 'darwin') throw new Error('Managed installation currently supports macOS. Use npm run setup and npm start for manual operation on other platforms.');
const execute = promisify(execFile);
const label = 'dev.repro.service';
const legacyLabel = 'dev.chrome-evidence.service';
const domain = `gui/${process.getuid()}`;
const service = `${domain}/${label}`;
const plistPath = path.join(homedir(), 'Library/LaunchAgents', `${label}.plist`);
const codexDirectory = process.env.CODEX_HOME || path.join(homedir(), '.codex');
const configPath = path.join(codexDirectory, 'config.toml');
async function readOptional(file) {
  try { return await readFile(file, 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return ''; throw error; }
}
async function atomicWrite(file, text, expected) {
  await mkdir(path.dirname(file), { recursive: true });
  if (expected !== undefined && await readOptional(file) !== expected) throw new Error(`${file} changed during installation. Run the command again.`);
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, text, { mode: 0o600 });
  await rename(temporary, file);
  await chmod(file, 0o600);
}
async function executable(name) {
  for (const directory of (process.env.PATH || '').split(path.delimiter)) {
    const file = path.join(directory, name);
    try { await access(file, constants.X_OK); return await realpath(file); }
    catch (error) { if (!['ENOENT', 'EACCES', 'ENOTDIR'].includes(error.code)) throw error; }
  }
  throw new Error(`${name} is missing from PATH. Install Node 22+ and FFmpeg first (on Homebrew: brew install node ffmpeg), then rerun npm run install:local.`);
}
async function loaded(target = service) {
  try { await execute('/bin/launchctl', ['print', target]); return true; }
  catch (error) { if (error.code === 113) return false; throw error; }
}
async function health(settings) {
  try {
    const response = await fetch(`http://127.0.0.1:${settings.port}/health`, { headers: { Authorization: `Bearer ${settings.token}` }, signal: AbortSignal.timeout(1500) });
    if (!response.ok) throw new Error(`Port ${settings.port} is occupied by an incompatible service (HTTP ${response.status}). Stop the old manual npm start process, then rerun installation.`);
    const result = await response.json();
    if (!['repro', 'chrome-evidence'].includes(result.service)) throw new Error(`Another service owns port ${settings.port}.`);
    return result;
  } catch (error) {
    if (error.cause?.code === 'ECONNREFUSED') return null;
    throw error;
  }
}
async function waitHealthy(settings) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const result = await health(settings);
    if (result?.service === 'repro' && result.version === version) return result;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error(`The service did not become ready. See ${path.join(runtime, 'service-error.log')}.`);
}
async function saveConfig(previous, next) {
  if (previous === next) return;
  if (previous) await writeFile(path.join(runtime, `codex-config-backup-${Date.now()}.toml`), previous, { mode: 0o600 });
  await atomicWrite(configPath, next, previous);
}
async function bootstrap() {
  // launchd can briefly return EIO while a previous bootout is still completing.
  for (let attempt = 0; ; attempt++) {
    try { await execute('/bin/launchctl', ['bootstrap', domain, plistPath]); return; }
    catch (error) {
      if (error.code !== 5 || attempt >= 19) throw error;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  }
}
async function install() {
  if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Node 22 or newer is required.');
  const ffmpeg = await executable('ffmpeg'), ffprobe = await executable('ffprobe');
  await execute(ffmpeg, ['-version']); await execute(ffprobe, ['-version']);
  await import('./setup.js');
  const settings = await config();
  const previous = await readOptional(configPath);
  const next = updateCodexConfig(previous, mcpConfiguration(installedMcpConfiguration(previous), settings));
  const running = await loaded();
  const legacyService = `${domain}/${legacyLabel}`;
  const legacyRunning = await loaded(legacyService);
  const existing = await health(settings);
  if (existing && !running && !legacyRunning) throw new Error('Repro is running manually. Stop its npm start process first, then rerun npm run install:local. The installer will not kill an unowned process.');
  const searchPath = [...new Set([path.dirname(process.execPath), path.dirname(ffmpeg), path.dirname(ffprobe), '/usr/local/bin', '/opt/homebrew/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin'])].join(':');
  const plist = launchAgentPlist({ label, node: process.execPath, root: root.replace(/\/$/, ''), runtime, searchPath });
  const oldPlist = await readOptional(plistPath);
  await atomicWrite(plistPath, plist, oldPlist);
  await execute('/usr/bin/plutil', ['-lint', plistPath]);
  if (legacyRunning) await execute('/bin/launchctl', ['bootout', legacyService]);
  if (running && oldPlist === plist) await execute('/bin/launchctl', ['kickstart', '-k', service]);
  else {
    if (running) await execute('/bin/launchctl', ['bootout', service]);
    await bootstrap();
  }
  const ready = await waitHealthy(settings);
  try { await unlink(path.join(homedir(), 'Library/LaunchAgents', `${legacyLabel}.plist`)); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  await saveConfig(previous, next);
  console.log(`Installed Repro ${version}. macOS starts and restarts the local service automatically.\nCodex MCP: repro (HTTP; no separate MCP process).\nExtension: ${path.join(root, 'dist/extension')}\nChrome: open chrome://extensions, enable Developer mode, choose Load unpacked, select that folder, and pin Repro. For an existing installation, click Reload.\nExtension currently connected: ${ready.extensionConnected}.\nRefresh/restart the MCP connection in Codex to replace its previous tool configuration.\nKeep this checkout in place. After moving it or updating Node, rerun npm run install:local.`);
}
async function uninstall() {
  await mkdir(runtime, { recursive: true, mode: 0o700 });
  const previous = await readOptional(configPath);
  const existing = installedMcpConfiguration(previous);
  const settings = await config();
  if (existing && existing.url !== `http://127.0.0.1:${settings.port}/mcp`) throw new Error('The repro MCP entry was changed. Refusing to remove a different configuration.');
  const next = updateCodexConfig(previous, undefined);
  if (await loaded()) await execute('/bin/launchctl', ['bootout', service]);
  try { await unlink(plistPath); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await saveConfig(previous, next);
  console.log('Removed the managed service and its MCP configuration. Captures, pairing settings, and the Chrome extension are retained. Remove the extension manually in chrome://extensions if desired.');
}
const action = process.argv[2];
switch (action) {
  case 'install': await install(); break;
  case 'uninstall': await uninstall(); break;
  case 'restart': await execute('/bin/launchctl', ['kickstart', '-k', service]); console.log(await waitHealthy(await config())); break;
  case 'status': console.log({ managed: await loaded(), health: await health(await config()), logs: runtime }); break;
  default: throw new Error('Use install, uninstall, restart, or status.');
}
