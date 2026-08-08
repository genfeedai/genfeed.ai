import { BatchItemStatus, ContentFormat } from '@genfeedai/enums';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ReviewGrid from './ReviewGrid';
import {
  getReviewFilterCounts,
  getVisibleReviewItems,
} from './review-grid.helpers';
import '@testing-library/jest-dom/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  usePathname: () => '/publish/review',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({
    href: (path: string) => path,
  }),
}));

const mockItems = [
  {
    batchId: 'batch-1',
    caption: 'Draft caption',
    createdAt: '2026-03-09T10:00:00.000Z',
    format: ContentFormat.IMAGE,
    id: 'item-1',
    platform: 'instagram',
    postId: 'post-1',
    status: BatchItemStatus.COMPLETED,
  },
];

const baseHandlers = {
  onBulkApprove: vi.fn(),
  onBulkReject: vi.fn(),
  onDiscardBatch: vi.fn(),
  onSelectItem: vi.fn(),
  onToggleSelect: vi.fn(),
};

describe('ReviewGrid', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders a table-only canvas without an inline detail panel', () => {
    render(
      <ReviewGrid
        activeItem={mockItems[0]}
        canDiscardBatch={true}
        isActioning={false}
        items={mockItems}
        selectedIds={new Set()}
        {...baseHandlers}
      />,
    );

    expect(screen.getByText('Draft caption')).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: 'Post' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Select a row or talk to the agent'),
    ).not.toBeInTheDocument();
  });

  it('should display empty state when no items', () => {
    render(
      <ReviewGrid
        activeItem={null}
        canDiscardBatch={false}
        isActioning={false}
        items={[]}
        selectedIds={new Set()}
        {...baseHandlers}
      />,
    );

    expect(screen.getByText('No items in this view')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Discard batch' }),
    ).not.toBeInTheDocument();
  });

  it('should show bulk actions when items are selected', () => {
    render(
      <ReviewGrid
        activeItem={mockItems[0]}
        canDiscardBatch={true}
        isActioning={false}
        items={mockItems}
        selectedIds={new Set(['item-1'])}
        {...baseHandlers}
      />,
    );

    expect(screen.getByText('1 selected')).toBeInTheDocument();
  });

  it('routes item, selection, and bulk actions', () => {
    const onSelectItem = vi.fn();
    const onToggleSelect = vi.fn();
    const onBulkApprove = vi.fn();
    const onBulkReject = vi.fn();

    render(
      <ReviewGrid
        activeItem={mockItems[0]}
        canDiscardBatch={true}
        isActioning={false}
        items={mockItems}
        selectedIds={new Set(['item-1'])}
        onBulkApprove={onBulkApprove}
        onBulkReject={onBulkReject}
        onDiscardBatch={vi.fn()}
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

  it('routes the whole-batch discard action', async () => {
    const user = userEvent.setup();
    const onDiscardBatch = vi.fn();

    render(
      <ReviewGrid
        activeItem={mockItems[0]}
        canDiscardBatch={true}
        isActioning={false}
        items={mockItems}
        selectedIds={new Set()}
        {...baseHandlers}
        onDiscardBatch={onDiscardBatch}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Discard batch' }));

    expect(onDiscardBatch).toHaveBeenCalledOnce();
  });

  it('counts and filters review statuses', () => {
    const items = [
      { id: 'ready', status: BatchItemStatus.COMPLETED },
      {
        id: 'approved',
        reviewDecision: 'approved',
        status: BatchItemStatus.COMPLETED,
      },
      { id: 'failed', status: BatchItemStatus.FAILED },
    ];

    expect(getReviewFilterCounts(items as never).ready).toBe(1);
    expect(
      getVisibleReviewItems(items as never, ['ready', 'failed']),
    ).toHaveLength(2);
  });
});
