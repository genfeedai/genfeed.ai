import { describe, expect, it } from 'vitest';
import {
  estimateConversationContextUsage,
  estimateTokenCount,
  formatTokenCount,
} from './estimate-conversation-context.util';

describe('estimateConversationContextUsage', () => {
  it('estimates four characters per token', () => {
    expect(estimateTokenCount('abcd')).toBe(1);
    expect(estimateTokenCount('abcdefgh')).toBe(2);
  });

  it('formats thousands compactly', () => {
    expect(formatTokenCount(800)).toBe('800');
    expect(formatTokenCount(12_400)).toBe('12k');
    expect(formatTokenCount(128_000)).toBe('128k');
  });

  it('caps the fill ratio at 1', () => {
    const usage = estimateConversationContextUsage(['a'.repeat(40)], 4);

    expect(usage.usedTokens).toBe(10);
    expect(usage.ratio).toBe(1);
    expect(usage.label).toBe('10 / 4');
  });
});
