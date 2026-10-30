import { loadMessages } from '@app-i18n/messages';
import {
  ContentFormat,
  ReviewDecision,
  TurboRunItemStatus,
  TurboRunStatus,
} from '@genfeedai/contracts';
import { DEFAULT_LOCALE, PSEUDO_LOCALE } from '@genfeedai/contracts/constants';
import type {
  ITurboRunItem,
  ITurboRunSummary,
} from '@genfeedai/contracts/interfaces';
import { fireEvent, render, screen } from '@testing-library/react';
import {
  createTranslator,
  NextIntlClientProvider,
  type useMessages,
} from 'next-intl';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { ReviewDecisionPanelProps } from '@/features/posts/props/review-decision-panel.props';
import ReviewDecisionPanel from './ReviewDecisionPanel';
import ReviewDetailPanelAside from './ReviewDetailPanelAside';
import ReviewDetailPanelEmpty from './ReviewDetailPanelEmpty';
import ReviewDetailPanelHeader from './ReviewDetailPanelHeader';
import { getTurboRunOptionLabel } from './ReviewQueueView';
import {
  buildReviewItemTargetPreview,
  formatReviewItemStatus,
  getReviewItemTitle,
} from './review-item.helpers';
import { getReviewPerformanceLabel } from './review-performance';

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: (path: string) => path }),
}));
vi.mock('./ReviewAssignmentPanel', () => ({ default: () => null }));

const messages: ReturnType<typeof useMessages> = loadMessages(PSEUDO_LOCALE);
const translate = createTranslator({
  locale: PSEUDO_LOCALE,
  messages,
  namespace: 'pages.publishing.review',
});
const item: ITurboRunItem = {
  turboRunId: 'batch-1',
  createdAt: '2026-10-23T12:00:00.000Z',
  format: ContentFormat.IMAGE,
  id: 'item-1',
  platform: 'twitter',
  status: TurboRunItemStatus.COMPLETED,
  postId: 'post-1',
};

function renderLocalized(children: ReactNode) {
  return render(
    <NextIntlClientProvider
      locale={PSEUDO_LOCALE}
      messages={messages}
      timeZone="UTC"
    >
      {children}
    </NextIntlClientProvider>,
  );
}

function decisionProps(): ReviewDecisionPanelProps {
  return {
    feedback: 'Fixture guidance',
    isActioning: false,
    isReady: true,
    isSelected: false,
    item,
    onApprove: vi.fn(),
    onReject: vi.fn(),
    onRequestChanges: vi.fn(),
    onToggleSelect: vi.fn(),
    setFeedback: vi.fn(),
  };
}

describe('Review messages through the real next-intl runtime', () => {
  it('renders localized empty and fallback titles instead of English literals', () => {
    renderLocalized(
      <>
        <ReviewDetailPanelEmpty />
        <ReviewDetailPanelHeader
          item={item}
          statusLabel={translate('status.ready')}
        />
      </>,
    );
    expect(
      screen.getByRole('heading', { name: translate('detail.emptyTitle') }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: translate('titles.draftPost') }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Select a row or talk to the agent'),
    ).not.toBeInTheDocument();
    expect(translate('detail.emptyTitle')).not.toBe(
      loadMessages(DEFAULT_LOCALE).pages.publishing.review.detail.emptyTitle,
    );
  });

  it('preserves decision payloads with localized buttons and accessibility labels', () => {
    const props = decisionProps();
    renderLocalized(<ReviewDecisionPanel {...props} />);
    fireEvent.click(
      screen.getByRole('button', { name: translate('decision.approveDraft') }),
    );
    expect(props.onApprove).toHaveBeenCalledExactlyOnceWith('item-1');
    fireEvent.click(
      screen.getByRole('button', {
        name: translate('decision.requestChanges'),
      }),
    );
    expect(props.onRequestChanges).toHaveBeenCalledExactlyOnceWith(
      'item-1',
      'Fixture guidance',
    );
    fireEvent.click(
      screen.getByRole('button', { name: translate('decision.reject') }),
    );
    expect(props.onReject).toHaveBeenCalledExactlyOnceWith(
      'item-1',
      'Fixture guidance',
    );
    fireEvent.click(
      screen.getByRole('button', { name: translate('decision.addSelection') }),
    );
    expect(props.onToggleSelect).toHaveBeenCalledExactlyOnceWith('item-1');
    fireEvent.change(
      screen.getByRole('textbox', { name: translate('decision.notes') }),
      { target: { value: 'Updated fixture' } },
    );
    expect(props.setFeedback).toHaveBeenCalledExactlyOnceWith(
      'Updated fixture',
    );
  });

  it('localizes resolved decisions while keeping them non-actionable', () => {
    renderLocalized(
      <ReviewDecisionPanel
        {...decisionProps()}
        isReady={false}
        item={{ ...item, reviewDecision: ReviewDecision.APPROVED }}
      />,
    );
    expect(
      screen.getByText(translate('decision.alreadyApproved')),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('localizes metadata, approval, outcome and review history fallbacks', () => {
    renderLocalized(
      <ReviewDetailPanelAside
        browserTimezone="UTC"
        formattedCreatedDate="Fixture created"
        formattedScheduledDate={null}
        isActioning={false}
        isReady={true}
        isSelected={false}
        item={item}
        onApprove={vi.fn()}
        onAssign={vi.fn()}
        onReject={vi.fn()}
        onRequestChanges={vi.fn()}
        onToggleSelect={vi.fn()}
        onUnassign={vi.fn()}
        reviewEvents={[
          {
            decision: ReviewDecision.REQUEST_CHANGES,
            reviewedAt: '2026-10-23T12:00:00.000Z',
          },
        ]}
        statusLabel={translate('status.ready')}
      />,
    );
    for (const key of [
      'detail.title',
      'approval.title',
      'outcome.title',
      'history.title',
    ]) {
      expect(
        screen.getByRole('heading', { name: translate(key) }),
      ).toBeInTheDocument();
    }
    for (const key of [
      'detail.notScheduled',
      'approval.pinnedOnApproval',
      'approval.awaitingTypedApproval',
      'history.decisions.request_changes',
      'history.unavailable',
      'outcome.notSynced',
    ]) {
      expect(screen.getByText(translate(key))).toBeInTheDocument();
    }
  });

  it('localizes helper-generated statuses, performance, titles and preview content', () => {
    expect(formatReviewItemStatus(item, translate)).toBe(
      translate('status.ready'),
    );
    expect(
      formatReviewItemStatus(
        { ...item, reviewDecision: ReviewDecision.APPROVED },
        translate,
      ),
    ).toBe(translate('status.approved'));
    expect(getReviewPerformanceLabel('winning', translate)).toBe(
      translate('performance.winning'),
    );
    expect(getReviewItemTitle(item, translate)).toBe(
      translate('titles.draftPost'),
    );
    const preview = buildReviewItemTargetPreview(item, translate);
    expect(preview?.release.title).toBe(translate('titles.draftPost'));
    expect(preview?.target.settings.caption).toBe(
      translate('titles.draftPost'),
    );
    expect(
      getReviewItemTitle({ ...item, caption: 'User caption' }, translate),
    ).toBe('User caption');
  });

  it('interpolates batch counts and localized status without altering batch identity', () => {
    const batch: ITurboRunSummary = {
      id: 'batch-123456',
      brandId: 'brand-1',
      completedCount: 20,
      createdAt: item.createdAt,
      contentMix: {
        carouselPercent: 0,
        imagePercent: 100,
        reelPercent: 0,
        storyPercent: 0,
        videoPercent: 0,
      },
      failedCount: 0,
      items: [],
      pendingCount: 0,
      platforms: [],
      status: TurboRunStatus.COMPLETED,
      totalCount: 20,
    };
    expect(getTurboRunOptionLabel(batch, translate)).toBe(
      translate('queue.batchOptionWithStatus', {
        id: '123456',
        count: 20,
        status: translate('queue.batchStatus.COMPLETED'),
      }),
    );
    expect(getTurboRunOptionLabel(batch, translate)).not.toBe(
      '123456 · 20 items · completed',
    );
  });
});
