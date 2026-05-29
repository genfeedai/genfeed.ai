import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ReviewQueueContent from './review-queue-content';

const mocks = vi.hoisted(() => ({
  getBatchesService: vi.fn(),
  loggerError: vi.fn(),
  replace: vi.fn(),
  useQuery: vi.fn(),
}));
const searchParamsState = new URLSearchParams();

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => mocks.getBatchesService,
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: { queryKey: unknown[] }) => mocks.useQuery(options),
  useQueryClient: () => ({
    setQueryData: vi.fn(),
  }),
}));

vi.mock('@services/core/logger.service', () => ({
  logger: {
    error: mocks.loggerError,
  },
}));

vi.mock('./components/ReviewGrid', () => ({
  default: ({
    activeFilter,
    activeItem,
    filterCounts,
    isActioning,
    items,
    onBulkApprove,
    onBulkReject,
    onApprove,
    onFilterChange,
    onReject,
    onRequestChanges,
    onSelectItem,
    onToggleSelect,
    selectedIds,
  }: {
    activeFilter: string;
    activeItem: { id: string } | null;
    filterCounts: Record<string, number>;
    isActioning: boolean;
    items: Array<{ id: string }>;
    onBulkApprove: () => void;
    onBulkReject: () => void;
    onApprove: (itemId: string) => void;
    onFilterChange: (filter: string) => void;
    onReject: (itemId: string, feedback?: string) => void;
    onRequestChanges: (itemId: string, feedback?: string) => void;
    onSelectItem: (itemId: string) => void;
    onToggleSelect: (itemId: string) => void;
    selectedIds: Set<string>;
  }) => (
    <div>
      <div>Review Grid</div>
      <div>Active filter: {activeFilter}</div>
      <div>Ready count: {filterCounts.ready}</div>
      <div>Actioning: {String(isActioning)}</div>
      <div>Selected count: {selectedIds.size}</div>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onSelectItem(item.id)}
        >
          Select {item.id}
        </button>
      ))}
      {items.map((item) => (
        <button
          key={`toggle-${item.id}`}
          type="button"
          onClick={() => onToggleSelect(item.id)}
        >
          Toggle {item.id}
        </button>
      ))}
      <button
        type="button"
        onClick={() => activeItem && onApprove(activeItem.id)}
      >
        Approve Active Item
      </button>
      <button type="button" onClick={() => onBulkApprove()}>
        Bulk Approve
      </button>
      <button type="button" onClick={() => onBulkReject()}>
        Bulk Reject
      </button>
      <button
        type="button"
        onClick={() =>
          activeItem && onRequestChanges(activeItem.id, 'Needs revision')
        }
      >
        Request Changes Active Item
      </button>
      <button
        type="button"
        onClick={() => activeItem && onReject(activeItem.id, 'Reject reason')}
      >
        Reject Active Item
      </button>
      <button type="button" onClick={() => onFilterChange('all')}>
        Show All
      </button>
    </div>
  ),
}));

vi.mock('./components/review-grid.helpers', () => ({
  getReviewFilterCounts: (items: Array<{ id: string; status?: string }>) => ({
    all: items.length,
    approved: items.filter((item) => item.status === 'approved').length,
    changes_requested: items.filter(
      (item) => item.status === 'changes_requested',
    ).length,
    failed: items.filter((item) => item.status === 'failed').length,
    pending: items.filter((item) => item.status === 'pending').length,
    ready: items.filter((item) => item.status === 'completed').length,
    skipped: items.filter((item) => item.status === 'skipped').length,
  }),
  getVisibleReviewItems: (
    items: Array<{ id: string; status?: string }>,
    filter: string,
  ) =>
    filter === 'all'
      ? items
      : items.filter((item) => item.status === 'completed'),
}));

vi.mock('./components/review-state', () => ({
  isReadyToReview: (item: { status?: string }) => item.status === 'completed',
}));

vi.mock('./components/ReviewStatsHeader', () => ({
  default: () => <div>Review Stats Header</div>,
}));

vi.mock('@ui/loading/default/Loading', () => ({
  default: () => <div>Loading…</div>,
}));

vi.mock('@ui/layout/container/Container', () => ({
  default: ({
    children,
    description,
    label,
    right,
  }: {
    children: ReactNode;
    description: string;
    label: string;
    right?: ReactNode;
  }) => (
    <section>
      <h1>{label}</h1>
      <p>{description}</p>
      {right}
      {children}
    </section>
  ),
}));

vi.mock('@ui/primitives/select', () => ({
  Select: ({
    children,
    onValueChange,
    value,
  }: {
    children: ReactNode;
    onValueChange: (value: string) => void;
    value: string;
  }) => (
    <div>
      <div>Selected batch: {value}</div>
      <button type="button" onClick={() => onValueChange('batch-2')}>
        Select batch-2
      </button>
      {children}
    </div>
  ),
  SelectContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  SelectItem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  SelectValue: () => <div>Select value</div>,
}));

vi.mock('@pages/posts/detail/PostDetailOverlay', () => ({
  default: ({ postId }: { postId: string | null }) => (
    <div data-testid="post-detail-overlay">{postId ?? 'closed'}</div>
  ),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/posts/review',
  useRouter: () => ({
    replace: mocks.replace,
  }),
  useSearchParams: () => ({
    get: (key: string) => searchParamsState.get(key),
    toString: () => searchParamsState.toString(),
  }),
}));

describe('ReviewQueueContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchParamsState.delete('batch');
    searchParamsState.delete('filter');
    searchParamsState.delete('item');
  });

  function mockReviewQueries({
    activeBatch = {
      id: 'batch-1',
      items: [
        {
          createdAt: '2026-01-01T00:00:00.000Z',
          format: 'video',
          id: 'item-1',
          postId: 'post-123',
          status: 'completed',
        },
        {
          createdAt: '2026-01-01T00:05:00.000Z',
          format: 'image',
          id: 'item-2',
          scheduledDate: '2026-01-02T00:00:00.000Z',
          status: 'completed',
        },
        {
          createdAt: '2026-01-01T00:10:00.000Z',
          format: 'post',
          id: 'item-3',
          status: 'pending',
        },
      ],
      status: 'completed',
      totalCount: 3,
    },
    activeBatchError = null,
    batchList = [
      {
        id: 'batch-1',
        status: 'completed',
        totalCount: 3,
      },
      {
        id: 'batch-2',
        status: 'running',
        totalCount: 2,
      },
    ],
    batchesError = null,
    isBatchLoading = false,
    isBatchesLoading = false,
    refetch = vi.fn().mockResolvedValue(undefined),
  }: {
    activeBatch?: unknown;
    activeBatchError?: Error | null;
    batchList?: unknown;
    batchesError?: Error | null;
    isBatchLoading?: boolean;
    isBatchesLoading?: boolean;
    refetch?: ReturnType<typeof vi.fn>;
  } = {}) {
    mocks.useQuery.mockImplementation((options: { queryKey: unknown[] }) => {
      if (options.queryKey[0] === 'review-batches') {
        return {
          data: batchList,
          error: batchesError,
          isLoading: isBatchesLoading,
        };
      }

      return {
        data: activeBatch,
        error: activeBatchError,
        isLoading: isBatchLoading,
        refetch,
      };
    });

    return { refetch };
  }

  it('shows an error state when the batch payload is invalid', () => {
    mocks.getBatchesService.mockResolvedValue({
      itemAction: vi.fn(),
    });
    mocks.useQuery.mockImplementation((options: { queryKey: unknown[] }) => {
      if (options.queryKey[0] === 'review-batches') {
        return {
          data: { items: [] },
          error: null,
          isLoading: false,
        };
      }

      return {
        data: null,
        error: null,
        isLoading: false,
        refetch: vi.fn(),
      };
    });

    render(<ReviewQueueContent />);

    expect(
      screen.getByText('Unable to load the review queue'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Review Grid')).not.toBeInTheDocument();
  });

  it('redirects approved manual-review drafts to the post detail page', async () => {
    const itemAction = vi.fn().mockResolvedValue({});
    const refetch = vi.fn().mockResolvedValue(undefined);

    mocks.getBatchesService.mockResolvedValue({
      itemAction,
    });
    mocks.useQuery.mockImplementation((options: { queryKey: unknown[] }) => {
      if (options.queryKey[0] === 'review-batches') {
        return {
          data: [
            {
              id: 'batch-1',
              status: 'completed',
              totalCount: 1,
            },
          ],
          error: null,
          isLoading: false,
        };
      }

      return {
        data: {
          id: 'batch-1',
          items: [
            {
              createdAt: new Date().toISOString(),
              format: 'video',
              id: 'item-1',
              postId: 'post-123',
              status: 'completed',
            },
          ],
          status: 'completed',
          totalCount: 1,
        },
        error: null,
        isLoading: false,
        refetch,
      };
    });

    render(<ReviewQueueContent />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Approve Active Item' }),
    );

    await waitFor(() => {
      expect(itemAction).toHaveBeenCalledWith('batch-1', {
        action: 'approve',
        itemIds: ['item-1'],
      });
      expect(screen.getByTestId('post-detail-overlay')).toHaveTextContent(
        'post-123',
      );
      expect(mocks.replace).toHaveBeenCalledWith(
        '/posts/review?batch=batch-1&filter=ready',
        { scroll: false },
      );
    });
  });

  it('loads review batches, syncs the active item, and handles batch/filter changes', async () => {
    const itemAction = vi.fn().mockResolvedValue({});
    mocks.getBatchesService.mockResolvedValue({ itemAction });
    mockReviewQueries();

    render(<ReviewQueueContent />);

    expect(await screen.findByText('Review Grid')).toBeInTheDocument();
    expect(screen.getByText('Review Stats Header')).toBeInTheDocument();
    expect(screen.getByText('Selected batch: batch-1')).toBeInTheDocument();
    expect(screen.getByText('Ready count: 2')).toBeInTheDocument();

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith(
        '/posts/review?batch=batch-1&filter=ready&item=item-1',
        { scroll: false },
      );
    });

    fireEvent.click(screen.getByRole('button', { name: 'Select item-2' }));
    expect(mocks.replace).toHaveBeenCalledWith(
      '/posts/review?batch=batch-1&filter=ready&item=item-2',
      { scroll: false },
    );

    fireEvent.click(screen.getByRole('button', { name: 'Show All' }));
    expect(mocks.replace).toHaveBeenCalledWith(
      '/posts/review?batch=batch-1&filter=all&item=item-1',
      { scroll: false },
    );

    fireEvent.click(screen.getByRole('button', { name: 'Select batch-2' }));
    expect(mocks.replace).toHaveBeenCalledWith(
      '/posts/review?batch=batch-2&filter=ready',
      { scroll: false },
    );
  });

  it('handles bulk approve, bulk reject, request changes, and reject actions', async () => {
    const itemAction = vi.fn().mockResolvedValue({});
    const { refetch } = mockReviewQueries();
    mocks.getBatchesService.mockResolvedValue({ itemAction });

    render(<ReviewQueueContent />);
    expect(await screen.findByText('Review Grid')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Toggle item-1' }));
    expect(screen.getByText('Selected count: 1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Bulk Approve' }));
    await waitFor(() => {
      expect(itemAction).toHaveBeenCalledWith('batch-1', {
        action: 'approve',
        itemIds: ['item-1'],
      });
      expect(refetch).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Toggle item-2' }));
    fireEvent.click(screen.getByRole('button', { name: 'Bulk Reject' }));
    await waitFor(() => {
      expect(itemAction).toHaveBeenCalledWith('batch-1', {
        action: 'reject',
        itemIds: ['item-2'],
      });
    });

    fireEvent.click(
      screen.getByRole('button', { name: 'Request Changes Active Item' }),
    );
    await waitFor(() => {
      expect(itemAction).toHaveBeenCalledWith('batch-1', {
        action: 'request_changes',
        feedback: 'Needs revision',
        itemIds: ['item-1'],
      });
    });

    fireEvent.click(screen.getByRole('button', { name: 'Reject Active Item' }));
    await waitFor(() => {
      expect(itemAction).toHaveBeenCalledWith('batch-1', {
        action: 'reject',
        feedback: 'Reject reason',
        itemIds: ['item-2'],
      });
    });
  });

  it('renders loading, empty, selected-batch error, and unresolved detail states', () => {
    mocks.getBatchesService.mockResolvedValue({ itemAction: vi.fn() });

    mockReviewQueries({ isBatchesLoading: true });
    const { rerender } = render(<ReviewQueueContent />);
    expect(screen.getByText('Loading…')).toBeInTheDocument();

    mocks.useQuery.mockReset();
    mockReviewQueries({ batchList: [] });
    rerender(<ReviewQueueContent />);
    expect(screen.getByText('No review work waiting')).toBeInTheDocument();

    mocks.useQuery.mockReset();
    mockReviewQueries({ activeBatchError: new Error('batch failed') });
    rerender(<ReviewQueueContent />);
    expect(
      screen.getByText('Unable to load the selected batch'),
    ).toBeInTheDocument();

    mocks.useQuery.mockReset();
    mockReviewQueries({ activeBatch: null });
    rerender(<ReviewQueueContent />);
    expect(
      screen.getByText('No batch details are available'),
    ).toBeInTheDocument();
  });

  it('logs action failures without crashing the review queue', async () => {
    const itemAction = vi.fn().mockRejectedValue(new Error('action failed'));
    mockReviewQueries();
    mocks.getBatchesService.mockResolvedValue({ itemAction });

    render(<ReviewQueueContent />);
    expect(await screen.findByText('Review Grid')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Toggle item-1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Bulk Approve' }));

    await waitFor(() => {
      expect(mocks.loggerError).toHaveBeenCalledWith(
        'Bulk approve failed',
        expect.any(Error),
      );
    });
  });
});
