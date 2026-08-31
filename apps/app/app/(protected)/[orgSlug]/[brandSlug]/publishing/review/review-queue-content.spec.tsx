import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ReviewQueueContent from './review-queue-content';
import { useReviewQueueContent } from './useReviewQueueContent';

const mocks = vi.hoisted(() => ({
  getBatchesService: vi.fn(),
  loggerError: vi.fn(),
  notificationError: vi.fn(),
  notificationSuccess: vi.fn(),
  notificationWarning: vi.fn(),
  notificationsService: {
    info: vi.fn(),
  },
  openAgentComposer: vi.fn(),
  openConfirm: vi.fn(),
  replace: vi.fn(),
  setFiltersNode: vi.fn(),
  setQueryData: vi.fn(),
  useQuery: vi.fn(),
}));
const searchParamsState = new URLSearchParams();

type ConfirmConfig = {
  confirmLabel?: string;
  isError?: boolean;
  label?: string;
  message?: string;
  onConfirm: () => void | Promise<void>;
};

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => mocks.getBatchesService,
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: { queryKey: unknown[] }) => mocks.useQuery(options),
  useQueryClient: () => ({
    setQueryData: mocks.setQueryData,
  }),
}));

vi.mock('@providers/global-modals/global-modals.provider', () => ({
  useConfirmModal: () => ({ openConfirm: mocks.openConfirm }),
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({
      error: mocks.notificationError,
      info: mocks.notificationsService.info,
      success: mocks.notificationSuccess,
      warning: mocks.notificationWarning,
    }),
  },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: {
    error: mocks.loggerError,
  },
}));

vi.mock('@/hooks/use-open-agent-composer', () => ({
  useOpenAgentComposer: () => mocks.openAgentComposer,
}));

vi.mock('./components/ReviewGrid', () => ({
  default: ({
    isActioning,
    items,
    onBulkApprove,
    onBulkReject,
    onBulkRewriteWithAgent,
    onSelectItem,
    onToggleSelect,
    selectedIds,
  }: {
    isActioning: boolean;
    items: Array<{ id: string }>;
    onBulkApprove: () => void;
    onBulkReject: () => void;
    onBulkRewriteWithAgent: () => void;
    onSelectItem: (itemId: string) => void;
    onToggleSelect: (itemId: string) => void;
    selectedIds: Set<string>;
  }) => (
    <div>
      <div>Review Grid</div>
      <div>Actioning: {String(isActioning)}</div>
      <div>Selected count: {selectedIds.size}</div>
      {items.length === 0 ? <div>No items in this view</div> : null}
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
      <button type="button" onClick={() => onBulkApprove()}>
        Bulk Approve
      </button>
      <button type="button" onClick={() => onBulkReject()}>
        Bulk Reject
      </button>
      <button type="button" onClick={() => onBulkRewriteWithAgent()}>
        Rewrite selected with agent
      </button>
    </div>
  ),
}));

// Single-item decision actions (approve / request changes / reject) moved to
// the agent Context rail via ReviewWorkspaceSurfaceAdapter — ReviewGrid is a
// table-only queue now (see ReviewQueueView.tsx).
vi.mock('./components/ReviewWorkspaceSurfaceAdapter', () => ({
  default: ({
    activeItem,
    onApprove,
    onAssign,
    onReject,
    onRequestChanges,
    onUnassign,
  }: {
    activeItem: { id: string } | null;
    isActioning: boolean;
    isSelected: boolean;
    onApprove: (itemId: string) => void;
    onAssign: (itemId: string, assigneeId: string) => void;
    onReject: (itemId: string, feedback?: string) => void;
    onRequestChanges: (itemId: string, feedback?: string) => void;
    onToggleSelect: (itemId: string) => void;
    onUnassign: (itemId: string) => void;
  }) => (
    <div>
      <button
        type="button"
        onClick={() => activeItem && onApprove(activeItem.id)}
      >
        Approve Active Item
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
      <button
        type="button"
        onClick={() => activeItem && onAssign(activeItem.id, 'user-1')}
      >
        Assign Active Item
      </button>
      <button
        type="button"
        onClick={() => activeItem && onUnassign(activeItem.id)}
      >
        Unassign Active Item
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
    setFiltersNode: mocks.setFiltersNode,
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
  usePathname: () => '/publishing/review',
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

  function latestConfirm(): ConfirmConfig {
    const config = mocks.openConfirm.mock.calls.at(-1)?.[0] as
      | ConfirmConfig
      | undefined;
    expect(config).toBeDefined();
    return config as ConfirmConfig;
  }

  function latestFiltersNode(): ReactNode {
    const node = mocks.setFiltersNode.mock.calls
      .filter(([candidate]) => candidate !== null)
      .at(-1)?.[0] as ReactNode;
    expect(node).toBeDefined();
    return node;
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
        '/publishing/review?batch=batch-1&filter=ready',
        { scroll: false },
      );
    });
  });

  it('assigns and unassigns the active inspector item without changing filters', async () => {
    const assignItem = vi.fn().mockResolvedValue({
      id: 'batch-1',
      items: [
        {
          assignee: { displayName: 'Jane Doe', handle: 'jane', id: 'user-1' },
          assigneeId: 'user-1',
          createdAt: new Date().toISOString(),
          format: 'video',
          id: 'item-1',
          status: 'COMPLETED',
        },
      ],
    });
    const unassignItem = vi.fn().mockResolvedValue({
      id: 'batch-1',
      items: [
        {
          createdAt: new Date().toISOString(),
          format: 'video',
          id: 'item-1',
          status: 'COMPLETED',
        },
      ],
    });

    mocks.getBatchesService.mockResolvedValue({
      assignItem,
      itemAction: vi.fn(),
      unassignItem,
    });
    mockReviewQueries({
      activeBatch: {
        id: 'batch-1',
        items: [
          {
            createdAt: new Date().toISOString(),
            format: 'video',
            id: 'item-1',
            status: 'COMPLETED',
          },
        ],
        status: 'COMPLETED',
        totalCount: 1,
      },
    });

    render(<ReviewQueueContent />);

    fireEvent.click(screen.getByRole('button', { name: 'Assign Active Item' }));
    await waitFor(() => {
      expect(assignItem).toHaveBeenCalledWith('batch-1', 'item-1', 'user-1');
    });

    fireEvent.click(
      screen.getByRole('button', { name: 'Unassign Active Item' }),
    );
    await waitFor(() => {
      expect(unassignItem).toHaveBeenCalledWith('batch-1', 'item-1');
    });
  });

  it('loads review batches, syncs the active item, and handles batch/filter changes', async () => {
    const itemAction = vi.fn().mockResolvedValue({});
    mocks.getBatchesService.mockResolvedValue({ itemAction });
    mockReviewQueries();

    render(<ReviewQueueContent />);

    expect(await screen.findByText('Review Grid')).toBeInTheDocument();
    // Batch picker + status filters live in the publish layout action rail
    // (filtersNode), not the page body — render what was portaled to assert on it.
    expect(screen.queryByText('Review Stats Header')).not.toBeInTheDocument();
    render(latestFiltersNode());
    expect(screen.getByText('Ready count: 2')).toBeInTheDocument();

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith(
        '/publishing/review?batch=batch-1&filter=ready&item=item-1',
        { scroll: false },
      );
    });

    fireEvent.click(screen.getByRole('button', { name: 'Select item-2' }));
    expect(mocks.replace).toHaveBeenCalledWith(
      '/publishing/review?batch=batch-1&filter=ready&item=item-2',
      { scroll: false },
    );

    fireEvent.click(screen.getByRole('button', { name: 'Show All' }));
    // Show All clears the filter (serializes to "all"). getNextActiveItemId
    // keeps the current active item when it remains visible, and item-2 is
    // visible under "all", so the active item does not move.
    expect(mocks.replace).toHaveBeenCalledWith(
      '/publishing/review?batch=batch-1&filter=all&item=item-2',
      { scroll: false },
    );
  });

  it('explains automatic ready-filter broadening once across rerenders and refetches', async () => {
    const { refetch } = mockReviewQueries({
      activeBatch: {
        id: 'batch-1',
        items: [
          {
            createdAt: '2026-01-01T00:00:00.000Z',
            format: 'post',
            id: 'item-1',
            status: 'PENDING',
          },
        ],
        status: 'COMPLETED',
        totalCount: 1,
      },
    });

    const { result, rerender } = renderHook(() => useReviewQueueContent());

    await waitFor(() => {
      expect(result.current.activeFilters).toEqual([]);
    });
    expect(mocks.notificationsService.info).toHaveBeenCalledOnce();
    expect(mocks.notificationsService.info).toHaveBeenCalledWith(
      'No items are ready, so all statuses are shown.',
    );

    rerender();
    await act(async () => {
      await result.current.refreshQueue();
    });

    expect(refetch).toHaveBeenCalled();
    expect(mocks.notificationsService.info).toHaveBeenCalledOnce();
  });

  it('does not notify when the operator manually shows all statuses', () => {
    mockReviewQueries();

    const { result } = renderHook(() => useReviewQueueContent());

    act(() => {
      result.current.handleFilterChange([]);
    });

    expect(result.current.activeFilters).toEqual([]);
    expect(mocks.notificationsService.info).not.toHaveBeenCalled();
  });

  it('explains a later distinct ready-to-all automatic broaden edge', async () => {
    mockReviewQueries({
      activeBatch: {
        id: 'batch-1',
        items: [
          {
            createdAt: '2026-01-01T00:00:00.000Z',
            format: 'post',
            id: 'item-1',
            status: 'PENDING',
          },
        ],
        status: 'COMPLETED',
        totalCount: 1,
      },
    });

    const { result } = renderHook(() => useReviewQueueContent());

    await waitFor(() => {
      expect(result.current.activeFilters).toEqual([]);
    });
    expect(mocks.notificationsService.info).toHaveBeenCalledOnce();

    act(() => {
      result.current.handleFilterChange(['ready']);
    });

    await waitFor(() => {
      expect(mocks.notificationsService.info).toHaveBeenCalledTimes(2);
    });
    expect(result.current.activeFilters).toEqual([]);
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

  async function clickDiscardBatchFromActionRail(
    user: ReturnType<typeof userEvent.setup>,
  ) {
    // Discard batch lives in the publish layout action rail (filtersNode),
    // not the page body — render the portaled node before clicking.
    await screen.findByText('Review Grid');
    render(latestFiltersNode());
    await user.click(
      await screen.findByRole('button', { name: 'Discard batch' }),
    );
  }

  it('requires confirmation before discarding a review batch', async () => {
    const user = userEvent.setup();
    const cancelBatch = vi.fn();
    const itemAction = vi.fn();
    mockReviewQueries();
    mocks.getBatchesService.mockResolvedValue({ cancelBatch, itemAction });

    render(<ReviewQueueContent />);
    await clickDiscardBatchFromActionRail(user);

    expect(itemAction).not.toHaveBeenCalled();
    expect(cancelBatch).not.toHaveBeenCalled();
    expect(mocks.openConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        confirmLabel: 'Discard batch',
        isError: true,
        label: 'Discard review batch',
      }),
    );
  });

  it('surfaces a retryable partial failure when cancellation fails after rejection', async () => {
    const user = userEvent.setup();
    const rejectedBatch = {
      id: 'batch-1',
      items: [
        { id: 'item-1', status: 'SKIPPED' },
        { id: 'item-2', status: 'SKIPPED' },
        { id: 'item-3', status: 'PENDING' },
      ],
      status: 'COMPLETED',
      totalCount: 3,
    };
    const itemAction = vi.fn().mockResolvedValue(rejectedBatch);
    const cancelBatch = vi.fn().mockRejectedValue(new Error('cancel failed'));
    const { refetch } = mockReviewQueries();
    mocks.getBatchesService.mockResolvedValue({ cancelBatch, itemAction });

    render(<ReviewQueueContent />);
    await clickDiscardBatchFromActionRail(user);
    await act(async () => latestConfirm().onConfirm());

    expect(itemAction).toHaveBeenCalledWith('batch-1', {
      action: 'reject',
      feedback: 'Review batch discarded.',
      itemIds: ['item-1', 'item-2'],
    });
    expect(cancelBatch).toHaveBeenCalledWith('batch-1');
    expect(
      itemAction.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    ).toBeLessThan(
      cancelBatch.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
    expect(mocks.notificationWarning).toHaveBeenCalledWith(
      'Ready drafts were discarded, but unfinished items could not be cancelled. Retry Discard batch to finish.',
    );
    expect(refetch).toHaveBeenCalled();
    expect(mocks.loggerError).toHaveBeenCalledWith(
      'Discard batch cancellation failed after review items were rejected',
      expect.any(Error),
    );
  });

  it('renders the canonical empty state after a review batch is discarded', async () => {
    const user = userEvent.setup();
    const cancelledBatch = {
      id: 'batch-1',
      items: [
        { id: 'item-1', status: 'SKIPPED' },
        { id: 'item-2', status: 'SKIPPED' },
        { id: 'item-3', status: 'SKIPPED' },
      ],
      status: 'CANCELLED',
      totalCount: 3,
    };
    const itemAction = vi.fn().mockResolvedValue(cancelledBatch);
    const cancelBatch = vi.fn().mockResolvedValue(cancelledBatch);
    mockReviewQueries();
    mocks.getBatchesService.mockResolvedValue({ cancelBatch, itemAction });

    const { rerender } = render(<ReviewQueueContent />);
    await clickDiscardBatchFromActionRail(user);
    await act(async () => latestConfirm().onConfirm());

    mocks.useQuery.mockReset();
    mockReviewQueries({
      activeBatch: cancelledBatch,
      batchList: [cancelledBatch],
    });
    rerender(<ReviewQueueContent />);

    expect(screen.getByText('No items in this view')).toBeVisible();
    // Action rail re-registers without Discard once nothing is reviewable.
    // Scope to the latest portaled node — prior portal renders can still be
    // mounted from earlier clicks in this test file/document.
    const { container: rail } = render(latestFiltersNode());
    expect(
      within(rail).queryByRole('button', { name: 'Discard batch' }),
    ).not.toBeInTheDocument();
    expect(mocks.notificationSuccess).toHaveBeenCalledWith(
      'Review batch discarded',
    );
  });

  it('seeds a selected-item rewrite with the batch and review item IDs', async () => {
    mockReviewQueries();
    mocks.getBatchesService.mockResolvedValue({ itemAction: vi.fn() });

    render(<ReviewQueueContent />);
    expect(await screen.findByText('Review Grid')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Toggle item-1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Toggle item-2' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Rewrite selected with agent' }),
    );

    expect(mocks.openAgentComposer).toHaveBeenCalledWith(
      expect.stringMatching(
        /batch ID batch-1.*Review item IDs: item-1, item-2.*without approving or scheduling/i,
      ),
    );
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
