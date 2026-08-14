export function shouldPollReplicatePrediction(
  isCloud: boolean,
  canReceiveWebhooks: boolean,
): boolean {
  return !isCloud || !canReceiveWebhooks;
}

export function replicateImageOutputStrategy(
  isBatchSupported: boolean,
): 'batch' | 'sequential' {
  return isBatchSupported ? 'batch' : 'sequential';
}

export function extractReplicateOutputUrls(output: unknown): string[] {
  if (typeof output === 'string') {
    return [output];
  }

  if (!Array.isArray(output)) {
    return [];
  }

  return output.filter((value): value is string => typeof value === 'string');
}

export type ReplicatePredictionStatus =
  | 'canceled'
  | 'failed'
  | 'pending'
  | 'succeeded';

export function interpretReplicatePredictionStatus(
  status?: string,
): ReplicatePredictionStatus {
  if (status === 'succeeded') {
    return 'succeeded';
  }
  if (status === 'canceled') {
    return 'canceled';
  }
  if (status === 'failed') {
    return 'failed';
  }
  return 'pending';
}

export function requireReplicateOutputUrls(
  output: unknown,
  predictionId: string,
): string[] {
  const outputUrls = extractReplicateOutputUrls(output);
  if (outputUrls.length === 0) {
    throw new Error(
      `Replicate prediction ${predictionId} succeeded without an output URL`,
    );
  }
  return outputUrls;
}

export function replicatePredictionFailureMessage(
  predictionId: string,
  status: string | undefined,
  error?: string,
): string {
  return error || `Replicate prediction ${predictionId} ${status}`;
}

export function replicatePredictionTimeoutMessage(
  predictionId: string,
  timeoutMs: number,
): string {
  return `Replicate prediction ${predictionId} timed out after ${timeoutMs}ms`;
}
