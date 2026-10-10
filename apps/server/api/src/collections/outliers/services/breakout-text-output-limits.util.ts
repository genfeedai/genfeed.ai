import { isValidPostLength } from '@api/collections/posts/services/post-generation-text.util';
import type { AccountPublishingConstraints } from '@genfeedai/contracts/interfaces';

/** One bound for capacity scoring estimates and accepted canonical text, including all thread separators. */
export function breakoutTextOutputLimits(
  format: 'text' | 'thread',
  constraints: Readonly<AccountPublishingConstraints>,
) {
  const channelLimit = constraints.usesWeightedCharacters
    ? constraints.maxWeightedCharacters
    : constraints.maxCharacters;
  if (!channelLimit || !Number.isSafeInteger(channelLimit) || channelLimit < 1)
    return null;
  const segmentCharacterLimit = Math.min(
    channelLimit,
    format === 'thread' ? 1500 : 16000,
  );
  const totalCharacterLimit =
    format === 'thread'
      ? segmentCharacterLimit * 9 + 16
      : segmentCharacterLimit;
  return {
    segmentCharacterLimit,
    totalCharacterLimit,
    acceptSegment: (text: string) =>
      text.length <= segmentCharacterLimit &&
      isValidPostLength(text, channelLimit, constraints.usesWeightedCharacters),
  };
}
