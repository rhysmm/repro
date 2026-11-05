import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { schemas, descriptions } from './schema.js';
import { readFile } from 'node:fs/promises';
export const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
export const instructions = 'Use Chrome Evidence to save cropped screenshots, annotated PNGs, and short screen recordings while testing or demonstrating websites with your existing Chrome browser controls. It adds click indicators and trims idle time automatically. Use capture_status for readiness and installation help. New tabs need one user REC click; reuse approved sessionId handles across clips. Sessions are independent across tabs. Do not record until the user approves.\nChoose a region by testId, role/name, CSS selector, rectangle, or a union of targets; use highlight boxes/arrows for screenshots. This server records evidence; continue navigation and interactions through your existing Chrome tools. Call capture_wait with sessionId and requestId until recording is true. Retrieve videos with capture_stop; keep approved sessions enabled between testing sessions. For a screenshot on a new tab, first start and approve a session, stop the initial clip, then capture_screenshot. Do not build custom screenshot/video editing scripts for supported crops or annotations. If the extension is disconnected, relay the supplied setup instructions and wait for the user; do not attempt to bypass Chrome installation or capture approval.';
export function createMcpServer(execute, connectionHelp = '') {
  const server = new McpServer({ name: 'chrome-evidence', title: 'Chrome Evidence — screenshots and recordings', version }, { instructions: `${instructions}\n${connectionHelp}`.trim() });
  for (const [name, schema] of Object.entries(schemas)) {
    server.registerTool(`capture_${name}`, {
      title: ({ status: 'Check Chrome capture readiness', start: 'Record cropped Chrome video', wait: 'Wait for capture approval', stop: 'Save recorded Chrome video', screenshot: 'Save annotated Chrome screenshot', release: 'Release Chrome capture session' })[name],
      description: descriptions[name], inputSchema: schema.shape,
      annotations: { readOnlyHint: ['status', 'wait'].includes(name), destructiveHint: false, openWorldHint: false },
    }, async args => {
      try { return { content: [{ type: 'text', text: JSON.stringify(await execute(name, schema.parse(args))) }] }; }
      catch (error) { return { isError: true, content: [{ type: 'text', text: error.message }] }; }
    });
  }
  return server;
}
