import type {
  OutlierBaselineScope,
  WinnerClassificationPostInput,
} from '@genfeedai/contracts/interfaces';
import { describe, expect, it } from 'vitest';
import { classifyWinners } from './winner-classification.helper';

const NOW = Date.UTC(2026, 9, 10);
const DAY = 24 * 60 * 60 * 1000;
const SCOPE: OutlierBaselineScope = {
  accountId: 'account-a',
  contentType: 'video',
  organizationId: 'org-a',
  platform: 'instagram',
};
const TYPICAL = { comments: 10, engagementRate: 2, likes: 100, views: 1000 };

function post(
  id: string,
  metrics: WinnerClassificationPostInput['metrics'] = TYPICAL,
  overrides: Partial<WinnerClassificationPostInput> = {},
): WinnerClassificationPostInput {
  return {
    ...SCOPE,
    id,
    isDeleted: false,
    isPinned: false,
    isPromoted: false,
    metrics,
    publishedAtMs: NOW - 3 * DAY,
    ...overrides,
  };
}

function history(count = 10): WinnerClassificationPostInput[] {
  return Array.from({ length: count }, (_, i) =>
    post(`history-${i}`, TYPICAL, { publishedAtMs: NOW - (i + 4) * DAY }),
  );
}

function classify(posts: WinnerClassificationPostInput[]) {
  return classifyWinners({ nowMs: NOW, posts, scope: SCOPE });
}

describe('classifyWinners (#5502)', () => {
  it('qualifies a post on any one signal and names it with its baseline', () => {
    const result = classify([
      post('engaged', { ...TYPICAL, engagementRate: 8 }),
      ...history(),
    ]);
    const engaged = result.posts.find((entry) => entry.id === 'engaged');

    expect(engaged?.isWinner).toBe(true);
    expect(engaged?.evidence).toEqual([
      expect.objectContaining({
        baseline: 2,
        ratio: 4,
        signal: 'engagementRate',
        tier: 'outlier',
        value: 8,
      }),
    ]);
    expect(
      result.posts.filter((entry) => entry.isWinner).map((entry) => entry.id),
    ).toEqual(['engaged']);
  });

  it('lists every qualifying signal, strongest first, with breakout tiers', () => {
    const result = classify([
      post('viral', {
        comments: 40,
        engagementRate: 2,
        likes: 1200,
        views: 4000,
      }),
      ...history(),
    ]);

    expect(
      result.posts[0]?.evidence.map((evidence) => [
        evidence.signal,
        evidence.tier,
      ]),
    ).toEqual([
      ['likes', 'breakout'],
      ['views', 'outlier'],
      ['comments', 'outlier'],
    ]);
  });

  it('never labels a winner without enough mature data', () => {
    const tooFew = classify([
      post('lonely', { ...TYPICAL, views: 100_000 }),
      ...history(3),
    ]);
    expect(tooFew.posts.every((entry) => !entry.isWinner)).toBe(true);
    expect(
      tooFew.baselines.every((b) => b.status === 'insufficient_data'),
    ).toBe(true);

    const immature = classify([
      post('fresh', { ...TYPICAL, views: 100_000 }, { publishedAtMs: NOW }),
      ...history(),
    ]);
    expect(immature.posts[0]?.isWinner).toBe(false);
  });

  it('ignores a signal that was not observed instead of guessing it', () => {
    const result = classify([
      post('unmeasured', { ...TYPICAL, likes: null, views: null }),
      ...history(),
    ]);

    expect(result.posts[0]?.isWinner).toBe(false);
    expect(result.baselines.map((baseline) => baseline.signal)).toEqual([
      'views',
      'engagementRate',
      'likes',
      'comments',
    ]);
  });
});
