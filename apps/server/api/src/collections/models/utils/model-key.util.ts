import { ModelProvider } from '@genfeedai/contracts';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';

export function baseModelKey(key?: string): string | undefined {
  if (!key || typeof key !== 'string') {
    return key;
  }
  return key.split(':')[0];
}

export function isTrainingKey(key?: unknown): boolean {
  if (!key || typeof key !== 'string') return false;
  const normalized = key.toLowerCase();
  if (normalized.startsWith('genfeed-ai/')) {
    return key.split('/').length === 3;
  }
  if (normalized.startsWith('genfeedai/')) {
    return key.split('/').length === 3;
  }
  return false;
}

export function isTrainerKey(key?: string): boolean {
  const base = baseModelKey(key);
  return base === MODEL_KEYS.REPLICATE_FAST_FLUX_TRAINER;
}

export function isFalDestination(
  key?: string,
  provider?: ModelProvider | string,
): boolean {
  if (!key || typeof key !== 'string') {
    return false;
  }

  if (provider) {
    return provider === ModelProvider.FAL;
  }

  const normalized = key.toLowerCase();
  return normalized.startsWith('fal-ai/') || normalized.startsWith('fal/');
}

/**
 * Build the stable public selection key for a provider endpoint.
 *
 * Replicate and historical `fal-ai/*` keys remain unchanged. Fal partner
 * endpoints receive a `fal/` selection namespace so they can coexist with a
 * Replicate row that uses the same provider-side `owner/model` endpoint.
 */
export function getProviderModelKey(
  provider: ModelProvider | string,
  endpoint: string,
): string {
  if (
    provider === ModelProvider.FAL &&
    !endpoint.toLowerCase().startsWith('fal-ai/')
  ) {
    return `fal/${endpoint}`;
  }

  return endpoint;
}

/** Resolve a collision-safe Fal selection key back to its provider endpoint. */
export function getFalEndpointFromModelKey(key: string): string {
  return key.toLowerCase().startsWith('fal/') ? key.slice(4) : key;
}

export function isGenfeedAiDestination(key?: string): boolean {
  if (!key || typeof key !== 'string') {
    return false;
  }

  return key.toLowerCase().startsWith('genfeed-ai/');
}

export function isReplicateDestination(
  key?: string,
  provider?: ModelProvider | string,
): boolean {
  if (!key || typeof key !== 'string') {
    return false;
  }
  if (provider) {
    return provider === ModelProvider.REPLICATE;
  }
  if (isFalDestination(key) || isGenfeedAiDestination(key)) {
    return false;
  }
  // Matches owner/model or owner/model:version. The model/version segments
  // allow dots for dot-versioned Replicate keys (e.g. "bytedance/seedream-4.5"),
  // but the owner segment stays dot-free to avoid over-matching arbitrary strings.
  return /^(?:[\w-]+\/[\w.-]+(?::[\w.-]+)?)$/.test(key);
}

export function isReplicateVersionId(key?: string): boolean {
  if (!key || typeof key !== 'string') {
    return false;
  }
  // Heuristic: replicate version ids are long hex strings
  return /^[a-f0-9]{25,}$/i.test(key);
}
