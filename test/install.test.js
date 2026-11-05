import test from 'node:test';
import assert from 'node:assert/strict';
import { parse } from 'smol-toml';
import { launchAgentPlist, mcpConfiguration, updateCodexConfig } from '../src/install-config.js';
const settings = { port: 47321, token: 'test-token' };
test('install replaces only the owned MCP entry and preserves unrelated settings and comments', () => {
  const original = `# Keep this comment\nmodel = "example"\n\n[mcp_servers.other]\ncommand = "other"\n\n[mcp_servers.chrome-evidence]\ncommand = "node"\nargs = ["old.js"]\ntool_timeout_sec = 60\n\n[mcp_servers.chrome-evidence.tools.capture_stop]\napproval_mode = "prompt"\n\n[projects."/some path"]\ntrust_level = "trusted"\n`;
  const entry = mcpConfiguration(parse(original).mcp_servers['chrome-evidence'], settings);
  const result = updateCodexConfig(original, entry);
  assert.match(result, /# Keep this comment/);
  assert.equal(parse(result).mcp_servers.other.command, 'other');
  assert.equal(parse(result).mcp_servers['chrome-evidence'].command, undefined);
  assert.equal(parse(result).mcp_servers['chrome-evidence'].url, 'http://127.0.0.1:47321/mcp');
  assert.equal(parse(result).mcp_servers['chrome-evidence'].tools.capture_stop.approval_mode, 'prompt');
  assert.equal(parse(result).mcp_servers['chrome-evidence'].http_headers.Authorization, 'Bearer test-token');
  assert.equal(updateCodexConfig(result, entry), result);
  const removed = updateCodexConfig(result, undefined);
  assert.equal(parse(removed).mcp_servers['chrome-evidence'], undefined);
  assert.equal(parse(removed).projects['/some path'].trust_level, 'trusted');
});
test('fresh installs and quoted server tables work, unsafe layouts leave input untouched', () => {
  const entry = mcpConfiguration(undefined, settings);
  assert.equal(parse(updateCodexConfig('', entry)).mcp_servers['chrome-evidence'].enabled, true);
  const quoted = `[mcp_servers."chrome-evidence"]\ncommand = "old"\n[mcp_servers."chrome-evidence".env]\nEXAMPLE = "old"\n`;
  assert.equal(parse(updateCodexConfig(quoted, entry)).mcp_servers['chrome-evidence'].env, undefined);
  assert.throws(() => updateCodexConfig('[mcp_servers]\nchrome-evidence = { command = "old" }\n', entry));
  assert.throws(() => updateCodexConfig('broken = [', entry));
});
test('launchd uses absolute argument paths, survives spaces, and restarts the service', () => {
  const xml = launchAgentPlist({ label: 'test.capture', node: '/path with spaces/node', root: '/repo & stuff', runtime: '/repo & stuff/.runtime', searchPath: '/bin:/other path' });
  assert.match(xml, /<string>\/path with spaces\/node<\/string>/);
  assert.match(xml, /\/repo &amp; stuff\/src\/server.js/);
  assert.match(xml, /<key>KeepAlive<\/key><true\/>/);
  assert.match(xml, /<key>RunAtLoad<\/key><true\/>/);
  assert.doesNotMatch(xml, /test-token/);
});
