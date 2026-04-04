import ReviewQueueContent from '@pages/review/review-queue-content';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useResourceMock = vi.fn();
const getBatchesServiceMock = vi.fn();
const replaceMock = vi.fn();
const searchParamsState = new URLSearchParams();

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => getBatchesServiceMock,
}));

vi.mock('@hooks/data/resource/use-resource/use-resource', () => ({
  useResource: (...args: unknown[]) => useResourceMock(...args),
}));

vi.mock('@pages/review/components/ReviewGrid', () => ({
  default: ({
    activeItem,
    onApprove,
  }: {
    activeItem: { id: string } | null;
    onApprove: (itemId: string) => void;
  }) => (
    <div>
      <div>Review Grid</div>
      <button
        type="button"
        onClick={() => activeItem && onApprove(activeItem.id)}
      >
        Approve Active Item
      </button>
    </div>
  ),
  getReviewFilterCounts: (items: Array<{ id: string }>) => ({
    all: items.length,
    approved: 0,
    changes_requested: 0,
    failed: 0,
    pending: 0,
    ready: items.length,
    skipped: 0,
  }),
  getVisibleReviewItems: (items: Array<{ id: string }>) => items,
  isReadyToReview: () => true,
}));

vi.mock('@pages/review/components/ReviewStatsHeader', () => ({
  default: () => <div>Review Stats Header</div>,
}));

vi.mock('@ui/loading/default/Loading', () => ({
  default: () => <div>Loading...</div>,
}));

vi.mock('@ui/layout/container/Container', () => ({
  default: ({
    children,
    description,
    label,
  }: {
    children: ReactNode;
    description: string;
    label: string;
  }) => (
    <section>
      <h1>{label}</h1>
      <p>{description}</p>
      {children}
    </section>
  ),
}));

vi.mock('@ui/primitives/select', () => ({
  Select: ({ children }: { children: ReactNode }) => <div>{children}</div>,
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
    replace: replaceMock,
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

  it('shows an error state when the batch payload is invalid', () => {
    getBatchesServiceMock.mockResolvedValue({
      itemAction: vi.fn(),
    });
    useResourceMock.mockImplementation(
      (_resource: unknown, options?: { defaultValue?: unknown }) => {
        if (options?.defaultValue !== undefined) {
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
          refresh: vi.fn(),
        };
      },
    );

    render(<ReviewQueueContent />);

    expect(
      screen.getByText('Unable to load the review queue'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Review Grid')).not.toBeInTheDocument();
  });

  it('redirects approved manual-review drafts to the post detail page', async () => {
    const itemAction = vi.fn().mockResolvedValue({});
    const refresh = vi.fn().mockResolvedValue(undefined);

    getBatchesServiceMock.mockResolvedValue({
      itemAction,
    });
    useResourceMock.mockImplementation(
      (_resource: unknown, options?: { defaultValue?: unknown }) => {
        if (options?.defaultValue !== undefined) {
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
          refresh,
        };
      },
    );

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
      expect(replaceMock).toHaveBeenCalledWith(
        '/posts/review?batch=batch-1&filter=ready',
        { scroll: false },
      );
    });
  });
});
