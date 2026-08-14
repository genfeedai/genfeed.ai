export type VideoOutputPlacement = 'batch' | 'sequential' | 'single';

export function resolveVideoOutputPlacement(
  isBatchSupported: boolean,
  outputs: number,
): VideoOutputPlacement {
  if (outputs <= 1) {
    return 'single';
  }

  return isBatchSupported ? 'batch' : 'sequential';
}

export function videoGenerationStartDetail(output?: number): string {
  return output
    ? `Video generation failed to start for output ${output}`
    : 'Video generation failed to start';
}
