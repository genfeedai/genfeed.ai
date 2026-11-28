import { unlinkSync } from 'node:fs';

export function requireVideoOutputPath(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error('Video processing result missing outputPath');
  }

  return value;
}

/**
 * The files worker leaves `output.mp4` on disk for the API to upload, so the
 * API deletes it once the upload has landed.
 */
export function discardVideoOutput(
  outputPath: string,
  logger: { warn: (message: string, error?: unknown) => void },
): void {
  try {
    unlinkSync(outputPath);
  } catch (error: unknown) {
    logger.warn(`Failed to cleanup temp file: ${outputPath}`, error);
  }
}
