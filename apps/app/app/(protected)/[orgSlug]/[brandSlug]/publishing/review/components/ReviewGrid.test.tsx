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
  usePathname: () => '/publishing/review',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({
    href: (path: string) => path,
  }),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (id: string) => `catalog:${id}`,
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
  onBulkRewriteWithAgent: vi.fn(),
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
    expect(
      screen.queryByRole('button', { name: 'Discard batch' }),
    ).not.toBeInTheDocument();
  });

  it('renders the table-owned empty state once when filters hide every item', () => {
    const visibleItems = getVisibleReviewItems(mockItems, ['failed']);

    expect(visibleItems).toHaveLength(0);

    render(
      <ReviewGrid
        activeItem={null}
        isActioning={false}
        items={visibleItems}
        selectedIds={new Set()}
        {...baseHandlers}
      />,
    );

    expect(screen.getByTestId('table-empty')).toBeInTheDocument();
    expect(screen.getAllByText('No items match these filters')).toHaveLength(1);
    expect(
      screen.getByText('Try All statuses, or pick another batch.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('No items in this view')).not.toBeInTheDocument();
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

    expect(
      screen.getByText((_, element) => element?.textContent === '1 selected'),
    ).toBeInTheDocument();
  });

  it('routes item, selection, and bulk actions', () => {
    const onSelectItem = vi.fn();
    const onToggleSelect = vi.fn();
    const onBulkApprove = vi.fn();
    const onBulkReject = vi.fn();
    const onBulkRewriteWithAgent = vi.fn();

    render(
      <ReviewGrid
        activeItem={mockItems[0]}
        isActioning={false}
        items={mockItems}
        selectedIds={new Set(['item-1'])}
        onBulkApprove={onBulkApprove}
        onBulkReject={onBulkReject}
        onBulkRewriteWithAgent={onBulkRewriteWithAgent}
        onSelectItem={onSelectItem}
        onToggleSelect={onToggleSelect}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Preview post' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Deselect item/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Approve$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Reject$/i }));
    fireEvent.click(
      screen.getByRole('button', { name: 'catalog:actions.rewriteWithAgent' }),
    );

    expect(onSelectItem).toHaveBeenCalledWith('item-1');
    expect(onToggleSelect).toHaveBeenCalledWith('item-1');
    expect(onBulkApprove).toHaveBeenCalledTimes(1);
    expect(onBulkReject).toHaveBeenCalledTimes(1);
    expect(onBulkRewriteWithAgent).toHaveBeenCalledTimes(1);
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
