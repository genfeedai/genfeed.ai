import { ModelKey } from '@genfeedai/enums';

export function baseModelKey(key?: string): string | undefined {
  if (!key || typeof key !== 'string') {
    return key;
  }
  return key.split(':')[0];
}

export function isTrainingKey(key?: string): boolean {
  if (!key || typeof key !== 'string') {
    return false;
  }
  return key.toLowerCase().startsWith('genfeedai');
}

export function isTrainerKey(key?: string): boolean {
  const base = baseModelKey(key);
  return base === ModelKey.REPLICATE_FAST_FLUX_TRAINER;
}

export function isFalDestination(key?: string): boolean {
  if (!key || typeof key !== 'string') {
    return false;
  }

  return key.toLowerCase().startsWith('fal-ai/');
}

export function isGenfeedAiDestination(key?: string): boolean {
  if (!key || typeof key !== 'string') {
    return false;
  }

  return key.toLowerCase().startsWith('genfeed-ai/');
}

export function isReplicateDestination(key?: string): boolean {
  if (!key || typeof key !== 'string') {
    return false;
  }
  if (isFalDestination(key) || isGenfeedAiDestination(key)) {
    return false;
  }
  // Matches owner/model or owner/model:version
  return /^(?:[\w-]+\/[\w-]+(?::[\w-]+)?)$/.test(key);
}

export function isReplicateVersionId(key?: string): boolean {
  if (!key || typeof key !== 'string') {
    return false;
  }
  // Heuristic: replicate version ids are long hex strings
  return /^[a-f0-9]{25,}$/i.test(key);
}
