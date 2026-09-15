import type { OutlierEligibilityFlags } from '@genfeedai/contracts/interfaces';
export function normalizeSourcePostFlags(
  value: unknown,
): OutlierEligibilityFlags {
  const record =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const read = (keys: string[]): boolean | null => {
    for (const key of keys)
      if (typeof record[key] === 'boolean') return record[key];
    return null;
  };
  return {
    isPinned: read(['isPinned', 'is_pinned', 'pinned']),
    isPromoted: read([
      'isPromoted',
      'is_promoted',
      'promoted',
      'isSponsored',
      'is_sponsored',
    ]),
  };
}
