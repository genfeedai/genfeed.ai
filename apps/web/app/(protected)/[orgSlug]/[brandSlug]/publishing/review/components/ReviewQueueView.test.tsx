import publishing from '@app-i18n/page-scopes/publishing';
import { TurboRunStatus } from '@genfeedai/contracts';
import type { ITurboRunSummary } from '@genfeedai/contracts/interfaces';
import { testId } from '@genfeedai/helpers/testing/test-id.helper';
import { createTranslator, type useMessages } from 'next-intl';
import { describe, expect, it } from 'vitest';

import { getTurboRunOptionLabel } from './ReviewQueueView';

const messages: ReturnType<typeof useMessages> = publishing;
const translate = createTranslator({
  locale: 'en',
  messages,
  namespace: 'publishing.review',
});

describe('getTurboRunOptionLabel', () => {
  it('humanizes SCREAMING batch status for the publish header dropdown', () => {
    const turboRunId = testId('turboRun');
    const turboRun: ITurboRunSummary = {
      brandId: 'brand-1',
      platforms: [],
      items: [],
      createdAt: '2026-10-23T12:00:00.000Z',
      contentMix: {
        imagePercent: 100,
        videoPercent: 0,
        carouselPercent: 0,
        reelPercent: 0,
        storyPercent: 0,
      },
      completedCount: 20,
      failedCount: 0,
      id: turboRunId,
      pendingCount: 0,
      status: TurboRunStatus.COMPLETED,
      totalCount: 20,
    };

    expect(getTurboRunOptionLabel(turboRun, translate)).toBe(
      `${turboRunId.slice(-6)} · 20 items · completed`,
    );
  });
});

describe('learning signals message', () => {
  it('says how many earlier approvals the batch drew on and never claims rejections', () => {
    expect(translate('queue.learningSignals', { approvals: 1 })).toBe(
      'Written with 1 approved draft from earlier reviews.',
    );
    expect(translate('queue.learningSignals', { approvals: 3 })).toBe(
      'Written with 3 approved drafts from earlier reviews.',
    );
  });
});
