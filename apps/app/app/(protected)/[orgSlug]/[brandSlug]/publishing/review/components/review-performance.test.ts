import publishing from '@app-i18n/page-scopes/publishing';
import { ContentFormat, TurboRunItemStatus } from '@genfeedai/contracts';
import { createTranslator, type useMessages } from 'next-intl';
import { describe, expect, it } from 'vitest';
import {
  getReviewPerformanceLabel,
  getReviewPerformanceSignal,
} from './review-performance';

const messages: ReturnType<typeof useMessages> = publishing;
const translate = createTranslator({
  locale: 'en',
  messages,
  namespace: 'publishing.review',
});

describe('review-performance', () => {
  it('detects winning content from views', () => {
    expect(
      getReviewPerformanceSignal({
        turboRunId: 'batch-1',
        createdAt: '2026-10-23T12:00:00.000Z',
        format: ContentFormat.IMAGE,
        id: 'item-1',
        status: TurboRunItemStatus.COMPLETED,
        postStatus: 'public',
        postTotalViews: 1400,
      }),
    ).toBe('winning');
  });

  it('detects underperforming content from low engagement', () => {
    expect(
      getReviewPerformanceSignal({
        turboRunId: 'batch-1',
        createdAt: '2026-10-23T12:00:00.000Z',
        format: ContentFormat.IMAGE,
        id: 'item-1',
        status: TurboRunItemStatus.COMPLETED,
        postAvgEngagementRate: 1.5,
        postStatus: 'public',
        postTotalViews: 10,
      }),
    ).toBe('underperforming');
  });

  it('labels known signals', () => {
    expect(getReviewPerformanceLabel('awaiting_analytics', translate)).toBe(
      'Awaiting analytics',
    );
    expect(getReviewPerformanceLabel(null, translate)).toBeNull();
  });
});
