import { capture } from './client.js';
import { schemas } from './schema.js';
const [command, json = '{}'] = process.argv.slice(2);
if (!Object.hasOwn(schemas, command)) throw new Error(`Usage: npm run capture -- ${Object.keys(schemas).join('|')} '{...}'`);
console.log(JSON.stringify(await capture(command, JSON.parse(json)), null, 2));
