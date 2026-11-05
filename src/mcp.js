import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from './mcp-tools.js';
import { capture } from './client.js';
await createMcpServer(capture).connect(new StdioServerTransport());
