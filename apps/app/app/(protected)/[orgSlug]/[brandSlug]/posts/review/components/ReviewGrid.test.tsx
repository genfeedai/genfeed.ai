import { BatchItemStatus, BatchStatus, ContentFormat } from '@genfeedai/enums';
import { fireEvent, render, screen } from '@testing-library/react';
import ReviewGrid, {
  getReviewFilterCounts,
  getVisibleReviewItems,
} from './ReviewGrid';
import '@testing-library/jest-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockBatch = {
  brandId: 'brand-1',
  completedCount: 1,
  contentMix: {
    carouselPercent: 10,
    imagePercent: 60,
    reelPercent: 10,
    storyPercent: 0,
    videoPercent: 20,
  },
  createdAt: '2026-03-09T10:00:00.000Z',
  failedCount: 0,
  id: 'batch-1',
  items: [],
  pendingCount: 0,
  platforms: ['instagram'],
  status: BatchStatus.COMPLETED,
  totalCount: 1,
};

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

describe('ReviewGrid', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render without crashing', () => {
    const { container } = render(
      <ReviewGrid
        activeFilter="ready"
        activeItem={mockItems[0]}
        batch={mockBatch}
        filterCounts={{
          all: 1,
          approved: 0,
          changes_requested: 0,
          failed: 0,
          pending: 0,
          ready: 1,
          skipped: 0,
        }}
        isActioning={false}
        items={mockItems}
        selectedIds={new Set()}
        onApprove={vi.fn()}
        onBulkApprove={vi.fn()}
        onBulkReject={vi.fn()}
        onFilterChange={vi.fn()}
        onRequestChanges={vi.fn()}
        onReject={vi.fn()}
        onSelectItem={vi.fn()}
        onToggleSelect={vi.fn()}
      />,
    );

    expect(container.firstChild).toBeInTheDocument();
  });

  it('should display empty state when no items', () => {
    render(
      <ReviewGrid
        activeFilter="ready"
        activeItem={null}
        batch={mockBatch}
        filterCounts={{
          all: 0,
          approved: 0,
          changes_requested: 0,
          failed: 0,
          pending: 0,
          ready: 0,
          skipped: 0,
        }}
        isActioning={false}
        items={[]}
        selectedIds={new Set()}
        onApprove={vi.fn()}
        onBulkApprove={vi.fn()}
        onBulkReject={vi.fn()}
        onFilterChange={vi.fn()}
        onRequestChanges={vi.fn()}
        onReject={vi.fn()}
        onSelectItem={vi.fn()}
        onToggleSelect={vi.fn()}
      />,
    );

    expect(screen.getByText('No items in this view')).toBeInTheDocument();
  });

  it('should show bulk actions when items are selected', () => {
    render(
      <ReviewGrid
        activeFilter="ready"
        activeItem={mockItems[0]}
        batch={mockBatch}
        filterCounts={{
          all: 1,
          approved: 0,
          changes_requested: 0,
          failed: 0,
          pending: 0,
          ready: 1,
          skipped: 0,
        }}
        isActioning={false}
        items={mockItems}
        selectedIds={new Set(['item-1'])}
        onApprove={vi.fn()}
        onBulkApprove={vi.fn()}
        onBulkReject={vi.fn()}
        onFilterChange={vi.fn()}
        onRequestChanges={vi.fn()}
        onReject={vi.fn()}
        onSelectItem={vi.fn()}
        onToggleSelect={vi.fn()}
      />,
    );

    expect(screen.getByText('1 selected')).toBeInTheDocument();
  });

  it('shows publishing context in the detail panel when metadata is present', () => {
    render(
      <ReviewGrid
        activeFilter="ready"
        activeItem={mockItems[0]}
        batch={mockBatch}
        filterCounts={{
          all: 1,
          approved: 0,
          changes_requested: 0,
          failed: 0,
          pending: 0,
          ready: 1,
          skipped: 0,
        }}
        isActioning={false}
        items={mockItems}
        selectedIds={new Set()}
        onApprove={vi.fn()}
        onBulkApprove={vi.fn()}
        onBulkReject={vi.fn()}
        onFilterChange={vi.fn()}
        onRequestChanges={vi.fn()}
        onReject={vi.fn()}
        onSelectItem={vi.fn()}
        onToggleSelect={vi.fn()}
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
      '/orchestration/strategy-1?opportunity=opp-1',
    );
    expect(screen.getByRole('link', { name: 'Open draft' })).toHaveAttribute(
      'href',
      '/posts/post-1',
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
      { id: 'generating', status: BatchItemStatus.GENERATING },
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

  it('routes filter, item, selection, and bulk actions', () => {
    const onFilterChange = vi.fn();
    const onSelectItem = vi.fn();
    const onToggleSelect = vi.fn();
    const onBulkApprove = vi.fn();
    const onBulkReject = vi.fn();

    render(
      <ReviewGrid
        activeFilter="ready"
        activeItem={mockItems[0]}
        batch={mockBatch}
        filterCounts={{
          all: 1,
          approved: 0,
          changes_requested: 0,
          failed: 0,
          pending: 0,
          ready: 1,
          skipped: 0,
        }}
        isActioning={false}
        items={mockItems}
        selectedIds={new Set(['item-1'])}
        onApprove={vi.fn()}
        onBulkApprove={onBulkApprove}
        onBulkReject={onBulkReject}
        onFilterChange={onFilterChange}
        onRequestChanges={vi.fn()}
        onReject={vi.fn()}
        onSelectItem={onSelectItem}
        onToggleSelect={onToggleSelect}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Approved0/i }));
    fireEvent.click(screen.getByRole('button', { name: /Draft caption/i }));
    fireEvent.click(screen.getByRole('button', { name: /Deselect item/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Approve$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Reject$/i }));

    expect(onFilterChange).toHaveBeenCalledWith('approved');
    expect(onSelectItem).toHaveBeenCalledWith('item-1');
    expect(onToggleSelect).toHaveBeenCalledWith('item-1');
    expect(onBulkApprove).toHaveBeenCalledTimes(1);
    expect(onBulkReject).toHaveBeenCalledTimes(1);
  });

  it('shows a completed review as non-actionable with saved reviewer context', () => {
    render(
      <ReviewGrid
        activeFilter="approved"
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
                reviewerId: 'user-1',
              },
            ],
            reviewFeedback: 'Final approved notes',
            scheduledDate: '2026-03-10T16:00:00.000Z',
            sourceActionId: undefined,
          } as never
        }
        batch={mockBatch}
        filterCounts={{
          all: 1,
          approved: 1,
          changes_requested: 0,
          failed: 0,
          pending: 0,
          ready: 0,
          skipped: 0,
        }}
        isActioning={false}
        items={mockItems}
        selectedIds={new Set()}
        onApprove={vi.fn()}
        onBulkApprove={vi.fn()}
        onBulkReject={vi.fn()}
        onFilterChange={vi.fn()}
        onRequestChanges={vi.fn()}
        onReject={vi.fn()}
        onSelectItem={vi.fn()}
        onToggleSelect={vi.fn()}
      />,
    );

    expect(
      screen.getByText('This item has already been approved.'),
    ).toBeVisible();
    expect(screen.getByText('Review history')).toBeVisible();
    expect(screen.getByText('Ship this one.')).toBeVisible();
    expect(screen.getByText('Saved reviewer notes')).toBeVisible();
    expect(screen.getAllByText('Final approved notes')).toHaveLength(2);
    expect(
      screen.queryByRole('link', { name: 'Open draft' }),
    ).not.toBeInTheDocument();
  });
});
