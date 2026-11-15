import type {
  IScheduledReleaseBatchPost,
  IScheduledReleaseBatchReview,
} from '@genfeedai/contracts/interfaces';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ScheduledReleaseBatchReviewState } from '../hooks/use-scheduled-release-batch-review';
import ScheduledReleaseBatchReview from './ScheduledReleaseBatchReview';

const confirmMocks = vi.hoisted(() => ({ openConfirm: vi.fn() }));

vi.mock(
  '@genfeedai/contexts/providers/global-modals/global-modals.hooks',
  () => ({
    useConfirmModal: () => ({ openConfirm: confirmMocks.openConfirm }),
  }),
);

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return {
    useLocale: () => 'en',
    useTranslations: (namespace: string) => translateFromCatalog(namespace),
  };
});

function post(
  index: number,
  overrides: Partial<IScheduledReleaseBatchPost> = {},
): IScheduledReleaseBatchPost {
  return {
    accountHandle: 'brand',
    accountLabel: 'Brand account',
    error: null,
    index,
    isRemoved: false,
    media: [],
    platform: 'twitter',
    releaseId: null,
    scheduledAt: `2026-11-1${5 + Math.floor(index / 2)}T0${index % 2 ? 8 : 4}:00:00.000Z`,
    text: `Batch post number ${index + 1}`,
    timezone: 'UTC',
    title: `Post ${index + 1}`,
    ...overrides,
  };
}

function review(
  overrides: Partial<IScheduledReleaseBatchReview> = {},
): IScheduledReleaseBatchReview {
  const posts = overrides.posts ?? [post(0), post(1), post(2), post(3)];
  return {
    approvalId: 'apr-1',
    brandLabel: 'Acme',
    expiresAt: '2026-11-21T08:00:00.000Z',
    posts,
    requestedAt: '2026-11-14T08:00:00.000Z',
    requestedByLabel: 'Vincent',
    status: 'pending',
    total: posts.length,
    ...overrides,
  };
}

function batchState(
  overrides: Partial<ScheduledReleaseBatchReviewState> = {},
): ScheduledReleaseBatchReviewState {
  return {
    approve: vi.fn().mockResolvedValue(true),
    decline: vi.fn().mockResolvedValue(true),
    error: null,
    isDeciding: false,
    isLoading: false,
    refresh: vi.fn(),
    review: undefined,
    ...overrides,
  };
}

describe('ScheduledReleaseBatchReview', () => {
  it('shows every post in full and who asked for them', () => {
    const data = review();
    render(<ScheduledReleaseBatchReview batch={batchState()} review={data} />);

    expect(
      screen.getByRole('heading', { name: 'Schedule 4 posts' }),
    ).toBeInTheDocument();
    for (const n of [1, 2, 3, 4]) {
      expect(screen.getByText(`Batch post number ${n}`)).toBeInTheDocument();
    }
    expect(
      screen.getByText('Requested by Vincent over MCP'),
    ).toBeInTheDocument();
    expect(screen.getByText('4 of 4 will be scheduled')).toBeInTheDocument();
  });

  it('approves only the posts the reviewer kept, naming the removed ones', () => {
    const batch = batchState();
    render(<ScheduledReleaseBatchReview batch={batch} review={review()} />);

    fireEvent.click(screen.getAllByRole('button', { name: /^Remove the/ })[1]);

    expect(screen.getByText('3 of 4 will be scheduled')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Approve 3' }));

    const confirm = confirmMocks.openConfirm.mock.calls.at(-1)?.[0];
    expect(confirm.confirmLabel).toBe('Schedule 3');
    void confirm.onConfirm();
    expect(batch.approve).toHaveBeenCalledWith([1]);
  });

  it('puts a removed post back', () => {
    render(
      <ScheduledReleaseBatchReview batch={batchState()} review={review()} />,
    );

    fireEvent.click(screen.getAllByRole('button', { name: /^Remove the/ })[0]);
    fireEvent.click(screen.getByRole('button', { name: /^Put back the/ }));

    expect(screen.getByText('4 of 4 will be scheduled')).toBeInTheDocument();
  });

  it('cannot approve once every post is removed', () => {
    render(
      <ScheduledReleaseBatchReview
        batch={batchState()}
        review={review({ posts: [post(0)] })}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /^Remove the/ }));

    expect(screen.getByRole('button', { name: 'Approve 0' })).toBeDisabled();
    expect(
      screen.getByText(
        'Every post is removed. Put one back, or decline the batch.',
      ),
    ).toBeInTheDocument();
  });

  it('shows the recorded outcome with release ids and the reason a post failed', () => {
    const data = review({
      posts: [
        post(0, { releaseId: 'rel_abc' }),
        post(1, { isRemoved: true }),
        post(2, { error: 'The account needs to be reconnected.' }),
      ],
      status: 'partially_scheduled',
    });
    render(<ScheduledReleaseBatchReview batch={batchState()} review={data} />);

    expect(
      screen.getByText('1 scheduled, 1 could not be scheduled'),
    ).toBeInTheDocument();
    expect(screen.getByText('rel_abc')).toBeInTheDocument();
    expect(
      screen.getByText('The account needs to be reconnected.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Remove the/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Approve/ })).toBeNull();
  });

  it('locks an expired request', () => {
    render(
      <ScheduledReleaseBatchReview
        batch={batchState()}
        review={review({ expiresAt: null, status: 'expired' })}
      />,
    );

    expect(screen.getByText('This request expired')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Approve/ })).toBeNull();
  });
});
