export type ImageDispatchExecutePath = 'batch' | 'sequential' | 'single';

function isSingleOutput(outputs: number): boolean {
  return outputs <= 1;
}

function resolveMultiOutputStrategy(
  outputStrategy: string | undefined,
): ImageDispatchExecutePath {
  if (outputStrategy === 'batch') {
    return 'batch';
  }

  if (outputStrategy === 'sequential') {
    return 'sequential';
  }

  return 'single';
}

export function resolveImageDispatchExecutePath(input: {
  outputStrategy?: string;
  outputs: number;
}): ImageDispatchExecutePath {
  if (isSingleOutput(input.outputs)) {
    return 'single';
  }

  return resolveMultiOutputStrategy(input.outputStrategy);
}

export function shouldFailAdditionalActivity(
  additionalActivityFailure: string | undefined,
): boolean {
  return additionalActivityFailure === 'fail';
}

export function shouldTrackSequentialOutputInResponse(
  trackAdditionalOutputsInResponse: boolean | undefined,
): boolean {
  return Boolean(trackAdditionalOutputsInResponse);
}
