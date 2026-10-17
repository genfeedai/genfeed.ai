import type { ReviewedProviderRate } from '@genfeedai/contracts/interfaces';

/**
 * The clip lengths each resolution can run, read from the reviewed rates.
 *
 * A rate that names both a `resolution` and a `duration` prices one exact
 * combination, so a combination with no such rate is unpriced and the quote
 * refuses it. Every resolution whose rates pin durations therefore has exactly
 * the lengths listed here, and a provider that adds, drops or caps a length
 * changes this answer when its rates are re-reviewed. Resolutions billed per
 * second, or whose rates name no duration, are not capped and are omitted.
 * Keys are lowercase so callers compare resolutions case-insensitively.
 */
export function deriveDurationsByResolution(
  rates: readonly ReviewedProviderRate[] | null | undefined,
): Record<string, number[]> | undefined {
  const byResolution = new Map<string, Set<number>>();
  for (const rate of rates ?? []) {
    const { duration, resolution } = rate.when;
    if (
      typeof resolution !== 'string' ||
      typeof duration !== 'number' ||
      !Number.isFinite(duration) ||
      duration <= 0
    )
      continue;
    const key = resolution.toLowerCase();
    byResolution.set(key, (byResolution.get(key) ?? new Set()).add(duration));
  }
  if (byResolution.size === 0) return undefined;
  return Object.fromEntries(
    [...byResolution].map(([key, durations]) => [
      key,
      [...durations].sort((a, b) => a - b),
    ]),
  );
}
