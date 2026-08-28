import { GenfeedError } from './errors';

export function parseInteger(value: string): number {
  const normalized = value.trim();
  if (!/^-?\d+$/.test(normalized)) {
    throw new GenfeedError(`Invalid integer "${value}"`);
  }

  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed)) {
    throw new GenfeedError(`Invalid integer "${value}"`);
  }

  return parsed;
}

export function parsePositiveInteger(value: string): number {
  let parsed: number;
  try {
    parsed = parseInteger(value);
  } catch {
    throw new GenfeedError(`Invalid positive integer "${value}"`);
  }

  if (parsed < 1) throw new GenfeedError(`Invalid positive integer "${value}"`);
  return parsed;
}
