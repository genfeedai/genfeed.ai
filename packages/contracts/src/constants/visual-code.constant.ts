export const VISUAL_CODE_RENDERER_VERSION = '4.0.530';
export const VISUAL_CODE_LIMITS = Object.freeze({
  requestId: 128,
  label: 120,
  promptBytes: 8 * 1024,
  sourceBytes: 256 * 1024,
  propsBytes: 16 * 1024,
  sourceAssets: 12,
  outputs: 8,
  minDimension: 256,
  maxDimension: 1920,
  maxPixels: 1920 * 1080,
  maxFrames: 900,
  maxSeconds: 30,
  deadlineMs: 120_000,
  inputBytes: 64 * 1024 * 1024,
  resultBytes: 64 * 1024 * 1024,
  diagnosticBytes: 8 * 1024,
  repairs: 2,
  authorTokens: 16_000,
  inspectionTokens: 1024,
});
export const VISUAL_CODE_DEFAULT_SETTINGS = Object.freeze({
  width: 1080,
  height: 1920,
  fps: 30 as const,
  durationFrames: 450,
});
export const VISUAL_CODE_OUTPUT_FORMATS = ['mp4', 'png', 'jpeg'] as const;
