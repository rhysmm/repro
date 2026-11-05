import { z } from 'zod';
export const target = z.union([
  z.object({ testId: z.string().min(1) }).strict(),
  z.object({ role: z.string().min(1), name: z.string().min(1) }).strict(),
  z.object({ selector: z.string().min(1) }).strict(),
  z.object({ x: z.number().nonnegative(), y: z.number().nonnegative(), width: z.number().positive(), height: z.number().positive() }).strict(),
]);
const region = z.union([target, z.array(target).min(1).max(10)]).optional();
export const schemas = {
  status: z.object({}).strict(),
  wait: z.object({ requestId: z.string().uuid(), seconds: z.number().min(0).max(50).default(50) }).strict(),
  start: z.object({ approval: z.enum(['toolbar', 'picker']).default('toolbar'), tabId: z.coerce.number().int().positive().optional(), url: z.url().optional(), region, padding: z.number().min(0).max(300).default(24), preserveTiming: z.boolean().default(false), maxSeconds: z.number().min(2).max(180).default(90) }).strict(),
  stop: z.object({ name: z.string().max(100).default('Recording') }).strict(),
  screenshot: z.object({ region, padding: z.number().min(0).max(300).default(24), highlight: z.array(z.object({ target, label: z.string().max(80).optional(), style: z.enum(['box', 'arrow']).default('box') }).strict()).max(20).default([]), name: z.string().max(100).default('Screenshot') }).strict(),
  release: z.object({}).strict(),
};
export const descriptions = {
  status: 'Check the connected Chrome capture session and pending user approval.',
  wait: 'Wait up to 50 seconds for a capture request to be approved or declined. Returns compact status. Use the requestId from start; only interact when recording is true.',
  start: 'Start a cropped clip. For a new tab, supply its numeric Chrome tabId and exact current url: this selects the target tab, shows REC? on the extension, and returns awaiting_approval. The user clicks the pinned Chrome Evidence toolbar icon once; recording starts automatically with no picker. The click must be on the exact requested tab and URL. Use approval: picker for the alternative sharing-picker flow. Call capture_wait before interacting. No agent computer use is needed for approval. Continue interactions using your existing Chrome tools, then stop. Region accepts testId, role/name, CSS selector, viewport rectangle, or an array whose bounds are combined. Defaults: viewport, 24px padding, automatic click rings and idle trimming. Fixed crop for predictable evidence; preserveTiming disables trimming.',
  stop: 'Finish the clip and return local MP4, original WebM, and timing manifest paths. Also retrieves a clip that reached maxSeconds. No polling needed.',
  screenshot: 'Save a cropped PNG with optional red boxes or arrows and labels. Uses the same region targets as start. Returns a local path, not image bytes.',
  release: 'End the capture session and stop sharing the tab. Finish any recording first.',
};
