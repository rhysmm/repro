import { verifyCaptureHandle } from './approval-state.js';
export async function acquireMedia(devices, request) {
  const stream = request.source === 'display'
    ? await devices.getDisplayMedia({ audio: false, video: { displaySurface: 'browser', cursor: 'always' }, monitorTypeSurfaces: 'exclude', surfaceSwitching: 'exclude', selfBrowserSurface: 'exclude' })
    : await devices.getUserMedia({ audio: false, video: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: request.streamId } } });
  try {
    if (request.expectedHandle) verifyCaptureHandle(request.expectedHandle, stream.getVideoTracks()[0].getCaptureHandle?.());
    return stream;
  } catch (error) {
    stream.getTracks().forEach(track => track.stop());
    throw error;
  }
}
