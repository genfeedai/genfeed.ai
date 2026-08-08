import { BatchItemStatus, ContentFormat } from '@genfeedai/enums';
import { fireEvent, render, screen } from '@testing-library/react';
import ReviewGrid from './ReviewGrid';
import {
  getReviewFilterCounts,
  getVisibleReviewItems,
} from './review-grid.helpers';
import '@testing-library/jest-dom/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  usePathname: () => '/publish/review',
  useSearchParams: () => new URLSearchParams(),
}));

const mockItems = [
  {
    batchId: 'batch-1',
    caption: 'Draft caption',
    createdAt: '2026-03-09T10:00:00.000Z',
    format: ContentFormat.IMAGE,
    gateOverallScore: 88,
    gateReasons: ['Image cleared the autopilot quality gate.'],
    id: 'item-1',
    opportunitySourceType: 'trend',
    opportunityTopic: 'AI launch hooks',
    platform: 'instagram',
    postId: 'post-1',
    postUrl: 'https://example.com/post-1',
    sourceActionId: 'opp-1',
    sourceWorkflowId: 'strategy-1',
    sourceWorkflowName: 'Autopilot Strategy',
    status: BatchItemStatus.COMPLETED,
  },
];

const baseHandlers = {
  onApprove: vi.fn(),
  onBulkApprove: vi.fn(),
  onBulkReject: vi.fn(),
  onRequestChanges: vi.fn(),
  onReject: vi.fn(),
  onSelectItem: vi.fn(),
  onToggleSelect: vi.fn(),
};

describe('ReviewGrid', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render without crashing', () => {
    const { container } = render(
      <ReviewGrid
        activeItem={mockItems[0]}
        isActioning={false}
        items={mockItems}
        selectedIds={new Set()}
        {...baseHandlers}
      />,
    );

    expect(container.firstChild).toBeInTheDocument();
  });

  it('should display empty state when no items', () => {
    render(
      <ReviewGrid
        activeItem={null}
        isActioning={false}
        items={[]}
        selectedIds={new Set()}
        {...baseHandlers}
      />,
    );

    expect(screen.getByText('No items in this view')).toBeInTheDocument();
  });

  it('should show bulk actions when items are selected', () => {
    render(
      <ReviewGrid
        activeItem={mockItems[0]}
        isActioning={false}
        items={mockItems}
        selectedIds={new Set(['item-1'])}
        {...baseHandlers}
      />,
    );

    expect(screen.getByText('1 selected')).toBeInTheDocument();
  });

  it('renders a table list of posts (filters live in the publish topbar)', () => {
    render(
      <ReviewGrid
        activeItem={mockItems[0]}
        isActioning={false}
        items={mockItems}
        selectedIds={new Set()}
        {...baseHandlers}
      />,
    );

    expect(
      screen.queryByRole('navigation', { name: 'Review status filters' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: 'Post' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: 'Platform' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Draft caption')).toBeInTheDocument();
  });

  it('shows publishing context in the detail panel when metadata is present', () => {
    render(
      <ReviewGrid
        activeItem={mockItems[0]}
        isActioning={false}
        items={mockItems}
        selectedIds={new Set()}
        {...baseHandlers}
      />,
    );

    expect(screen.getByText('AI launch hooks')).toBeInTheDocument();
    expect(screen.getByText('trend')).toBeInTheDocument();
    expect(screen.getByText('88/100')).toBeInTheDocument();
    expect(
      screen.getByText('Image cleared the autopilot quality gate.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open strategy' })).toHaveAttribute(
      'href',
      '/automate/strategy-1?opportunity=opp-1',
    );
    expect(screen.getByRole('link', { name: 'Open draft' })).toHaveAttribute(
      'href',
      '/publish/post-1',
    );
    expect(
      screen
        .getAllByRole('link', { name: 'Open published URL' })
        .every(
          (link) => link.getAttribute('href') === 'https://example.com/post-1',
        ),
    ).toBe(true);
  });

  it('counts review filters from status and review decisions', () => {
    const items = [
      { id: 'ready', status: BatchItemStatus.COMPLETED },
      {
        id: 'approved',
        reviewDecision: 'approved',
        status: BatchItemStatus.COMPLETED,
      },
      {
        id: 'changes',
        reviewDecision: 'request_changes',
        status: BatchItemStatus.COMPLETED,
      },
      { id: 'failed', status: BatchItemStatus.FAILED },
      { id: 'pending', status: BatchItemStatus.PENDING },
      { id: 'generating', status: BatchItemStatus.PROCESSING },
      { id: 'skipped', status: BatchItemStatus.SKIPPED },
      {
        id: 'rejected',
        reviewDecision: 'rejected',
        status: BatchItemStatus.COMPLETED,
      },
    ];

    expect(getReviewFilterCounts(items as never)).toEqual({
      all: 8,
      approved: 1,
      changes_requested: 1,
      failed: 1,
      pending: 2,
      ready: 1,
      skipped: 2,
    });
  });

  it('filters visible review items for every review filter', () => {
    const items = [
      { id: 'ready', status: BatchItemStatus.COMPLETED },
      {
        id: 'approved',
        reviewDecision: 'approved',
        status: BatchItemStatus.COMPLETED,
      },
      {
        id: 'changes',
        reviewDecision: 'request_changes',
        status: BatchItemStatus.COMPLETED,
      },
      { id: 'failed', status: BatchItemStatus.FAILED },
      { id: 'pending', status: BatchItemStatus.PENDING },
      { id: 'skipped', status: BatchItemStatus.SKIPPED },
    ];

    expect(getVisibleReviewItems(items as never, 'all')).toHaveLength(6);
    expect(getVisibleReviewItems(items as never, 'ready')).toHaveLength(1);
    expect(getVisibleReviewItems(items as never, 'approved')).toHaveLength(1);
    expect(
      getVisibleReviewItems(items as never, 'changes_requested'),
    ).toHaveLength(1);
    expect(getVisibleReviewItems(items as never, 'failed')).toHaveLength(1);
    expect(getVisibleReviewItems(items as never, 'pending')).toHaveLength(1);
    expect(getVisibleReviewItems(items as never, 'skipped')).toHaveLength(1);
  });

  it('routes item, selection, and bulk actions', () => {
    const onSelectItem = vi.fn();
    const onToggleSelect = vi.fn();
    const onBulkApprove = vi.fn();
    const onBulkReject = vi.fn();

    render(
      <ReviewGrid
        activeItem={mockItems[0]}
        isActioning={false}
        items={mockItems}
        selectedIds={new Set(['item-1'])}
        onApprove={vi.fn()}
        onBulkApprove={onBulkApprove}
        onBulkReject={onBulkReject}
        onRequestChanges={vi.fn()}
        onReject={vi.fn()}
        onSelectItem={onSelectItem}
        onToggleSelect={onToggleSelect}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Draft caption/i }));
    fireEvent.click(screen.getByRole('button', { name: /Deselect item/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Approve$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Reject$/i }));

    expect(onSelectItem).toHaveBeenCalledWith('item-1');
    expect(onToggleSelect).toHaveBeenCalledWith('item-1');
    expect(onBulkApprove).toHaveBeenCalledTimes(1);
    expect(onBulkReject).toHaveBeenCalledTimes(1);
  });

  it('shows a completed review as non-actionable with saved reviewer context', () => {
    render(
      <ReviewGrid
        activeItem={
          {
            ...mockItems[0],
            postId: undefined,
            postUrl: undefined,
            reviewDecision: 'approved',
            reviewEvents: [
              {
                decision: 'approved',
                feedback: 'Ship this one.',
                reviewedAt: '2026-03-09T12:00:00.000Z',
                reviewer: {
                  avatar: 'https://cdn.example.com/ada.png',
                  displayName: 'Ada Lovelace',
                  handle: 'ada',
                  id: 'user-1',
                },
                reviewerId: 'user-1',
              },
              {
                decision: 'request_changes',
                feedback: 'Legacy feedback.',
                reviewedAt: '2026-03-08T12:00:00.000Z',
              },
            ],
            reviewFeedback: 'Final approved notes',
            scheduledDate: '2026-03-10T16:00:00.000Z',
            sourceActionId: undefined,
          } as never
        }
        isActioning={false}
        items={mockItems}
        selectedIds={new Set()}
        {...baseHandlers}
      />,
    );

    expect(
      screen.getByText('This item has already been approved.'),
    ).toBeVisible();
    expect(screen.getByText('Review history')).toBeVisible();
    expect(screen.getByText('Ship this one.')).toBeVisible();
    expect(screen.getByText('Ada Lovelace')).toBeVisible();
    expect(screen.getByText('@ada')).toBeVisible();
    expect(screen.getByText('Reviewer unavailable')).toBeVisible();
    expect(screen.getByText('Saved reviewer notes')).toBeVisible();
    expect(screen.getAllByText('Final approved notes')).toHaveLength(2);
    expect(
      screen.queryByRole('link', { name: 'Open draft' }),
    ).not.toBeInTheDocument();
  });
});
