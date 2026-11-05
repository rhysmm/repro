import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { schemas, descriptions } from './schema.js';
import { capture } from './client.js';
const server = new McpServer({ name: 'chrome-evidence', version: '0.4.1' });
for (const [name, schema] of Object.entries(schemas)) {
  server.registerTool(`capture_${name}`, { description: descriptions[name], inputSchema: schema.shape }, async args => {
    try { return { content: [{ type: 'text', text: JSON.stringify(await capture(name, args)) }] }; }
    catch (error) { return { isError: true, content: [{ type: 'text', text: error.message }] }; }
  });
}
await server.connect(new StdioServerTransport());
