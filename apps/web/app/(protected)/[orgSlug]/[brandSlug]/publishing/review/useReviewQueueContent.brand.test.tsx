import type { ITurboRunSummary } from '@genfeedai/contracts/interfaces';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useReviewQueueContent } from './useReviewQueueContent';

const { scope, turboRunsService } = vi.hoisted(() => ({
  scope: {
    brandId: 'brand-a' as string | undefined,
    isReady: true,
    organizationId: 'org-1',
    pageScope: 'brand' as const,
  },
  turboRunsService: {
    getTurboRun: vi.fn(),
    getTurboRuns: vi.fn(),
  },
}));

vi.mock(
  '@hooks/navigation/use-collection-scope/use-collection-scope',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('@hooks/navigation/use-collection-scope/use-collection-scope')
    >()),
    useCollectionScope: () => ({ ...scope }),
  }),
);

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => turboRunsService,
}));

vi.mock(
  '@genfeedai/contexts/providers/global-modals/global-modals.hooks',
  () => ({ useConfirmModal: () => ({ openConfirm: vi.fn() }) }),
);

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: { getInstance: () => ({}) },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}));

vi.mock('./useTurboRewriteJob', () => ({
  useTurboRewriteJob: () => ({
    isRewriteStarting: false,
    rewriteProgress: null,
    rewritingIds: new Set<string>(),
    startRewrite: vi.fn(),
  }),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/acme/main/publishing/approvals',
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/lib/workspace-shell/workspace-shell-telemetry', () => ({
  captureWorkspaceShellApproval: vi.fn(),
}));

const runA = { id: 'run-a', items: [] } as unknown as ITurboRunSummary;
const runB = { id: 'run-b', items: [] } as unknown as ITurboRunSummary;

function createWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe('useReviewQueueContent brand scoping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    scope.brandId = 'brand-a';
    scope.isReady = true;
    turboRunsService.getTurboRuns.mockImplementation(
      async ({ brandId }: { brandId?: string }) =>
        brandId === 'brand-b' ? [runB] : [runA],
    );
    turboRunsService.getTurboRun.mockImplementation(async (id: string) =>
      id === 'run-b' ? runB : runA,
    );
  });

  it('lists the batches of the active brand and swaps them on a brand switch', async () => {
    const { result, rerender } = renderHook(() => useReviewQueueContent(), {
      wrapper: createWrapper(),
    });
    await waitFor(() =>
      expect(result.current.turboRunList.map((run) => run.id)).toEqual([
        'run-a',
      ]),
    );
    expect(turboRunsService.getTurboRuns).toHaveBeenCalledWith({
      brandId: 'brand-a',
    });

    scope.brandId = 'brand-b';
    rerender();

    await waitFor(() =>
      expect(result.current.turboRunList.map((run) => run.id)).toEqual([
        'run-b',
      ]),
    );
  });

  it('does not fetch while the brand id is unknown', () => {
    scope.brandId = undefined;
    const { result } = renderHook(() => useReviewQueueContent(), {
      wrapper: createWrapper(),
    });

    expect(result.current.turboRunList).toEqual([]);
    expect(turboRunsService.getTurboRuns).not.toHaveBeenCalled();
  });
});
