import { describe, expect, it } from 'vitest';
import {
  getReviewPerformanceLabel,
  getReviewPerformanceSignal,
} from './review-performance';

describe('review-performance', () => {
  it('detects winning content from views', () => {
    expect(
      getReviewPerformanceSignal({
        postStatus: 'public',
        postTotalViews: 1400,
      } as never),
    ).toBe('winning');
  });

  it('detects underperforming content from low engagement', () => {
    expect(
      getReviewPerformanceSignal({
        postAvgEngagementRate: 1.5,
        postStatus: 'public',
        postTotalViews: 10,
      } as never),
    ).toBe('underperforming');
  });

  it('labels known signals', () => {
    expect(getReviewPerformanceLabel('awaiting_analytics')).toBe(
      'Awaiting analytics',
    );
    expect(getReviewPerformanceLabel(null)).toBeNull();
  });
});
