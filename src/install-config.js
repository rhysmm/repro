import { parse, stringify } from 'smol-toml';
import { isDeepStrictEqual } from 'node:util';
const serverName = 'repro';
const legacyServerName = 'chrome-evidence';
export function installedMcpConfiguration(text) {
  const servers = parse(text).mcp_servers;
  if (servers?.[serverName] && servers?.[legacyServerName]) throw new Error('Both Repro and the legacy Chrome Evidence MCP entries exist. Resolve the duplicate entries before installing; no configuration was changed.');
  return servers?.[serverName] ?? servers?.[legacyServerName];
}
export function updateCodexConfig(text, replacement) {
  const before = parse(text);
  const sections = text.split(/(?=^[ \t]*\[)/m);
  const kept = sections.filter(section => {
    const header = section.split('\n', 1)[0].trim();
    return !/^\[\s*(?:mcp_servers|"mcp_servers"|'mcp_servers')\s*\.\s*(?:repro|"repro"|'repro'|chrome-evidence|"chrome-evidence"|'chrome-evidence')\s*(?:\.|\])/.test(header);
  }).join('');
  const result = kept.trimEnd() + '\n' + (replacement ? '\n' + stringify({ mcp_servers: { [serverName]: replacement } }) : '');
  const after = parse(result);
  const withoutOurs = config => {
    const copy = structuredClone(config);
    delete copy.mcp_servers?.[serverName];
    delete copy.mcp_servers?.[legacyServerName];
    if (copy.mcp_servers && !Object.keys(copy.mcp_servers).length) delete copy.mcp_servers;
    return copy;
  };
  if (!isDeepStrictEqual(withoutOurs(before), withoutOurs(after)) || !isDeepStrictEqual(structuredClone(after.mcp_servers?.[serverName]), structuredClone(replacement)) || after.mcp_servers?.[legacyServerName]) {
    throw new Error('Cannot safely update this Codex configuration layout. No configuration was changed. Use a normal [mcp_servers.repro] table rather than inline or dotted-key server definitions.');
  }
  return result;
}
export function mcpConfiguration(existing, settings) {
  const result = { ...existing };
  for (const field of ['command', 'args', 'cwd', 'env', 'env_vars', 'bearer_token_env_var', 'env_http_headers', 'http_headers_helper', 'auth', 'oauth_client_id', 'oauth_resource', 'environment_id']) delete result[field];
  return { ...result, url: `http://127.0.0.1:${settings.port}/mcp`, http_headers: { Authorization: `Bearer ${settings.token}` }, enabled: true, startup_timeout_sec: 15, tool_timeout_sec: 200 };
}
const xml = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
export function launchAgentPlist({ label, node, root, runtime, searchPath }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${xml(label)}</string>
<key>ProgramArguments</key><array><string>${xml(node)}</string><string>${xml(root + '/src/server.js')}</string></array>
<key>WorkingDirectory</key><string>${xml(root)}</string>
<key>EnvironmentVariables</key><dict><key>PATH</key><string>${xml(searchPath)}</string></dict>
<key>RunAtLoad</key><true/><key>KeepAlive</key><true/>
<key>ThrottleInterval</key><integer>10</integer>
<key>StandardOutPath</key><string>${xml(runtime + '/service.log')}</string>
<key>StandardErrorPath</key><string>${xml(runtime + '/service-error.log')}</string>
</dict></plist>\n`;
}
