import { GenfeedError } from './errors';

export function parsePositiveInteger(value: string): number {
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) {
    throw new GenfeedError(`Invalid positive integer "${value}"`);
  }

  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new GenfeedError(`Invalid positive integer "${value}"`);
  }

  return parsed;
}
