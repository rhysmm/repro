import { config } from './config.js';
import { createCaptureService } from './service.js';
const settings = await config();
const service = await createCaptureService(settings);
service.server.listen(settings.port, '127.0.0.1', () => console.log(`Repro listening on http://127.0.0.1:${settings.port}`));
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, async () => { await service.close(); });
