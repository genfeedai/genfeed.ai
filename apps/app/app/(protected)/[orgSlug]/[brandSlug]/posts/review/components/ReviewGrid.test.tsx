import { BatchItemStatus, BatchStatus, ContentFormat } from '@genfeedai/enums';
import { render, screen } from '@testing-library/react';
import ReviewGrid from './ReviewGrid';
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
        .every((link) => link.getAttribute('href') === 'https://example.com/post-1'),
    ).toBe(true);
  });
});
