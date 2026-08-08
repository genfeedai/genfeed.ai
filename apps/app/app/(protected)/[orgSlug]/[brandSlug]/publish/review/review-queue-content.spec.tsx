import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
    activeItem,
    isActioning,
    items,
    onBulkApprove,
    onBulkReject,
    onApprove,
    onReject,
    onRequestChanges,
    onSelectItem,
    onToggleSelect,
    selectedIds,
  }: {
    activeItem: { id: string } | null;
    isActioning: boolean;
    items: Array<{ id: string }>;
    onBulkApprove: () => void;
    onBulkReject: () => void;
    onApprove: (itemId: string) => void;
    onReject: (itemId: string, feedback?: string) => void;
    onRequestChanges: (itemId: string, feedback?: string) => void;
    onSelectItem: (itemId: string) => void;
    onToggleSelect: (itemId: string) => void;
    selectedIds: Set<string>;
  }) => (
    <div>
      <div>Review Grid</div>
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
    </div>
  ),
}));

vi.mock('./components/ReviewStatusFilters', () => ({
  PUBLISH_HEADER_DROPDOWN_CLASS: '',
  default: ({
    activeFilters,
    filterCounts,
    onFilterChange,
  }: {
    activeFilters: string[];
    filterCounts: Record<string, number>;
    onFilterChange: (filters: string[]) => void;
  }) => (
    <div>
      <div>Active filters: {activeFilters.join(',') || 'all'}</div>
      <div>Ready count: {filterCounts.ready}</div>
      <button type="button" onClick={() => onFilterChange([])}>
        Show All
      </button>
      <button
        type="button"
        onClick={() => onFilterChange(['ready', 'approved'])}
      >
        Select Ready And Approved
      </button>
    </div>
  ),
}));

vi.mock('./components/review-grid.helpers', () => ({
  areReviewFiltersEqual: (left: string[], right: string[]) =>
    left.length === right.length &&
    left.every((value, index) => value === right[index]),
  getReviewFilterCounts: (items: Array<{ id: string; status?: string }>) => ({
    all: items.length,
    approved: items.filter((item) => item.status === 'approved').length,
    changes_requested: items.filter(
      (item) => item.status === 'changes_requested',
    ).length,
    failed: items.filter((item) => item.status === 'FAILED').length,
    pending: items.filter((item) => item.status === 'PENDING').length,
    ready: items.filter((item) => item.status === 'COMPLETED').length,
    skipped: items.filter((item) => item.status === 'SKIPPED').length,
  }),
  getVisibleReviewItems: (
    items: Array<{ id: string; status?: string }>,
    filters: string[],
  ) =>
    !filters || filters.length === 0
      ? items
      : items.filter((item) => item.status === 'COMPLETED'),
  getNextActiveItemId: (
    items: Array<{ id: string }>,
    currentItemId: string | null,
  ) => {
    if (items.length === 0) {
      return null;
    }

    if (!currentItemId) {
      return items[0]?.id ?? null;
    }

    const currentIndex = items.findIndex((item) => item.id === currentItemId);

    if (currentIndex === -1) {
      return items[0]?.id ?? null;
    }

    return items[currentIndex + 1]?.id ?? items[currentIndex - 1]?.id ?? null;
  },
  parseReviewFilters: (value: string | null) => {
    if (value == null || value === '') {
      return null;
    }
    if (value === 'all') {
      return [];
    }
    return value.split(',').filter(Boolean);
  },
  serializeReviewFilters: (filters: string[]) =>
    filters.length === 0 ? 'all' : filters.join(','),
}));

vi.mock('./components/review-state', () => ({
  isReadyToReview: (item: { status?: string }) => item.status === 'COMPLETED',
}));

vi.mock('@ui/loading/default/Loading', () => ({
  default: () => <div>Loading…</div>,
}));

vi.mock('@contexts/posts/posts-layout-context', () => ({
  usePostsLayout: () => ({
    setExportNode: vi.fn(),
    setFiltersNode: vi.fn(),
    setIsRefreshing: vi.fn(),
    setRefresh: vi.fn(),
    setScheduleActionsNode: vi.fn(),
    setViewToggleNode: vi.fn(),
  }),
}));

vi.mock('@ui/buttons/dropdown/button-dropdown/ButtonDropdown', () => ({
  default: ({
    onChange,
    value,
  }: {
    onChange: (name: string, value: string) => void;
    value: string;
  }) => (
    <div>
      <div>Selected batch: {value}</div>
      <button type="button" onClick={() => onChange('review-batch', 'batch-2')}>
        Select batch-2
      </button>
    </div>
  ),
}));

vi.mock('@pages/posts/detail/PostDetailOverlay', () => ({
  default: ({ postId }: { postId: string | null }) => (
    <div data-testid="post-detail-overlay">{postId ?? 'closed'}</div>
  ),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/publish/review',
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
          status: 'COMPLETED',
        },
        {
          createdAt: '2026-01-01T00:05:00.000Z',
          format: 'image',
          id: 'item-2',
          scheduledDate: '2026-01-02T00:00:00.000Z',
          status: 'COMPLETED',
        },
        {
          createdAt: '2026-01-01T00:10:00.000Z',
          format: 'post',
          id: 'item-3',
          status: 'PENDING',
        },
      ],
      status: 'COMPLETED',
      totalCount: 3,
    },
    activeBatchError = null,
    batchList = [
      {
        id: 'batch-1',
        status: 'COMPLETED',
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
          isFetching: isBatchesLoading,
          isLoading: isBatchesLoading,
          refetch: refetch,
        };
      }

      return {
        data: activeBatch,
        error: activeBatchError,
        isFetching: isBatchLoading,
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
          isFetching: false,
          isLoading: false,
          refetch: vi.fn(),
        };
      }

      return {
        data: null,
        error: null,
        isFetching: false,
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
              status: 'COMPLETED',
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
              status: 'COMPLETED',
            },
          ],
          status: 'COMPLETED',
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
        '/publish/review?batch=batch-1&filter=ready',
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
    // Batch picker lives in publish layout action rail (filtersNode), not body.
    expect(screen.queryByText('Review Stats Header')).not.toBeInTheDocument();
    expect(screen.getByText('Ready count: 2')).toBeInTheDocument();

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith(
        '/publish/review?batch=batch-1&filter=ready&item=item-1',
        { scroll: false },
      );
    });

    fireEvent.click(screen.getByRole('button', { name: 'Select item-2' }));
    expect(mocks.replace).toHaveBeenCalledWith(
      '/publish/review?batch=batch-1&filter=ready&item=item-2',
      { scroll: false },
    );

    fireEvent.click(screen.getByRole('button', { name: 'Show All' }));
    expect(mocks.replace).toHaveBeenCalledWith(
      '/publish/review?batch=batch-1&filter=all&item=item-1',
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

    // Pin active selection before single-item actions (bulk may advance it).
    fireEvent.click(screen.getByRole('button', { name: 'Select item-1' }));
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

    fireEvent.click(screen.getByRole('button', { name: 'Select item-2' }));
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
