import { Platform } from '@genfeedai/contracts';
import { getChannelCapability } from '@genfeedai/contracts/api-types/contracts/channel-capabilities.contract';
import { parseTweet } from 'twitter-text';

export type VariationRejectionReason =
  | 'duplicate'
  | 'empty'
  | 'platform-limit'
  | 'source-reproduction';

export interface FilterVariationOutputsResult {
  accepted: string[];
  rejected: Record<VariationRejectionReason, number>;
}

const createRejectionCounts = (): Record<VariationRejectionReason, number> => ({
  duplicate: 0,
  empty: 0,
  'platform-limit': 0,
  'source-reproduction': 0,
});

const normalizeText = (value: string): string =>
  value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/https?:\/\/\S+/gu, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/gu, ' ');

const tokenSet = (value: string): Set<string> =>
  new Set(normalizeText(value).split(' ').filter(Boolean));

const similarity = (left: string, right: string): number => {
  const leftTokens = tokenSet(left);
  const rightTokens = tokenSet(right);
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
  let intersection = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) intersection++;
  }
  return intersection / Math.max(leftTokens.size, rightTokens.size);
};

const exceedsPlatformLimit = (value: string, platform: string): boolean => {
  const capability = getChannelCapability(platform);
  if (!capability) return true;
  const length =
    platform === Platform.TWITTER
      ? parseTweet(value).weightedLength
      : Array.from(value).length;
  return length > capability.caption.maxLength;
};

export function filterSourcePostVariations(
  candidates: string[],
  sourceText: string,
  platform: string,
): FilterVariationOutputsResult {
  const accepted: string[] = [];
  const rejected = createRejectionCounts();
  const normalizedSource = normalizeText(sourceText);

  for (const rawCandidate of candidates) {
    const candidate = rawCandidate.trim();
    if (!candidate) {
      rejected.empty++;
      continue;
    }
    if (exceedsPlatformLimit(candidate, platform)) {
      rejected['platform-limit']++;
      continue;
    }

    const normalizedCandidate = normalizeText(candidate);
    if (
      normalizedCandidate === normalizedSource ||
      (tokenSet(sourceText).size >= 6 &&
        similarity(candidate, sourceText) >= 0.9)
    ) {
      rejected['source-reproduction']++;
      continue;
    }
    if (
      accepted.some(
        (existing) =>
          normalizeText(existing) === normalizedCandidate ||
          similarity(existing, candidate) >= 0.9,
      )
    ) {
      rejected.duplicate++;
      continue;
    }
    accepted.push(candidate);
  }

  return { accepted, rejected };
}

export function describeVariationRejections(
  requestedCount: number,
  actualCount: number,
  rejected: FilterVariationOutputsResult['rejected'],
): string | undefined {
  if (actualCount === requestedCount) return undefined;

  const labels: Array<[VariationRejectionReason, string]> = [
    ['source-reproduction', 'source reproduction'],
    ['duplicate', 'duplicate'],
    ['platform-limit', 'platform-limit violation'],
    ['empty', 'empty output'],
  ];
  const reasons = labels.flatMap(([key, label]) =>
    rejected[key] > 0
      ? [`${rejected[key]} ${label}${rejected[key] === 1 ? '' : 's'}`]
      : [],
  );
  const missingCount = Math.max(
    0,
    requestedCount -
      actualCount -
      Object.values(rejected).reduce((sum, count) => sum + count, 0),
  );
  if (missingCount > 0) {
    reasons.push(
      `${missingCount} missing output${missingCount === 1 ? '' : 's'}`,
    );
  }

  return `Generated ${actualCount} of ${requestedCount}: ${reasons.join(', ') || 'the content engine returned fewer usable outputs'}.`;
}
