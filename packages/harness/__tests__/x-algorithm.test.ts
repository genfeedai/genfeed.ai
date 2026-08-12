import { describe, expect, it } from 'vitest';
import {
  isXPlatform,
  scoreXPublicMetrics,
  scoreXPublicMetricsPer1k,
  X_PLATFORM_HARNESS_PACK,
} from '../src/platforms/x-algorithm';
import type {
  ContentHarnessContribution,
  ContentHarnessInput,
} from '../src/types';

function contribute(input: ContentHarnessInput): ContentHarnessContribution {
  const result = X_PLATFORM_HARNESS_PACK.contribute?.(input);
  if (!result || result instanceof Promise) {
    throw new Error('Expected a synchronous contribution');
  }
  return result;
}

describe('isXPlatform', () => {
  it('matches common X/Twitter spellings', () => {
    expect(isXPlatform('x')).toBe(true);
    expect(isXPlatform('twitter')).toBe(true);
    expect(isXPlatform('X.com')).toBe(true);
    expect(isXPlatform('twitter/posts')).toBe(true);
    expect(isXPlatform('instagram')).toBe(false);
    expect(isXPlatform(undefined)).toBe(false);
  });
});

describe('scoreXPublicMetrics', () => {
  it('weights comments far above likes (conversation > passive like)', () => {
    const likeHeavy = scoreXPublicMetrics({ likes: 100, comments: 0 });
    const replyHeavy = scoreXPublicMetrics({ likes: 0, comments: 8 });
    expect(replyHeavy).toBeGreaterThan(likeHeavy);
  });

  it('ranks save/share intent above likes at equal counts', () => {
    const likesOnly = scoreXPublicMetrics({ likes: 10 });
    const saves = scoreXPublicMetrics({ saves: 10 });
    const shares = scoreXPublicMetrics({ shares: 10 });
    expect(saves).toBeGreaterThan(likesOnly);
    expect(shares).toBeGreaterThan(likesOnly);
  });

  it('normalizes by views when present', () => {
    const smallAudience = scoreXPublicMetricsPer1k({
      comments: 10,
      views: 1000,
    });
    const largeAudience = scoreXPublicMetricsPer1k({
      comments: 10,
      views: 100_000,
    });
    expect(smallAudience).toBeGreaterThan(largeAudience);
  });
});

describe('X_PLATFORM_HARNESS_PACK', () => {
  it('is a no-op off X', () => {
    const contribution = contribute({
      intent: {
        contentType: 'post',
        objective: 'engagement',
        platform: 'instagram',
      },
    });
    expect(contribution.systemDirectives).toEqual([]);
    expect(contribution.evaluationCriteria).toEqual([]);
  });

  it('injects conversation-first craft rules on twitter/x', () => {
    const contribution = contribute({
      intent: {
        contentType: 'post',
        objective: 'engagement',
        platform: 'twitter',
      },
    });

    expect(contribution.systemDirectives?.length).toBeGreaterThan(0);
    expect(contribution.evaluationCriteria).toEqual(
      expect.arrayContaining([
        expect.stringContaining('conversation potential'),
      ]),
    );
    expect(contribution.guardrails).toEqual(
      expect.arrayContaining([expect.stringContaining('report-bait')]),
    );
    expect(
      contribution.providerHints?.some((h) => h.includes('Heavy Ranker')),
    ).toBe(true);
  });

  it('adds thread depth guidance for threads', () => {
    const contribution = contribute({
      intent: {
        contentType: 'thread',
        objective: 'authority',
        platform: 'x',
      },
    });
    expect(contribution.styleDirectives).toEqual(
      expect.arrayContaining([expect.stringContaining('thread')]),
    );
  });
});
