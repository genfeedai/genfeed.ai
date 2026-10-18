import type { IReviewInboxItem } from '@genfeedai/contracts/interfaces';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  filterReviewInboxItems,
  isAgentSourceVisible,
  useReviewInboxApprovals,
} from './useReviewInboxApprovals';

const fixture = vi.hoisted(() => ({
  decide: vi.fn(),
  getPendingItems: vi.fn(),
  notificationError: vi.fn(),
  notificationSuccess: vi.fn(),
  searchParams: new URLSearchParams(),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({
    decide: fixture.decide,
    getPendingItems: fixture.getPendingItems,
  }),
}));
vi.mock('next/navigation', () => ({
  useSearchParams: () => fixture.searchParams,
}));
vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return {
    useTranslations: (namespace: string) => translateFromCatalog(namespace),
  };
});
vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({
      error: fixture.notificationError,
      success: fixture.notificationSuccess,
    }),
  },
}));
vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn() },
}));

function item(overrides: Partial<IReviewInboxItem>): IReviewInboxItem {
  return {
    actionSummary: 'Publish post',
    approvalId: 'apr-1',
    brandId: null,
    brandLabel: null,
    estimatedCredits: null,
    executionId: null,
    expiresAt: null,
    id: 'mcp_approval:apr-1',
    isResolvable: true,
    kind: 'mcp_approval',
    nodeId: null,
    preview: { caption: null, mediaUrl: null },
    reasons: [],
    requestedAt: '2026-10-01T00:00:00.000Z',
    source: 'mcp_client',
    sourceLabel: 'publish_post',
    status: 'pending',
    toolName: 'publish_post',
    workflowId: null,
    ...overrides,
  };
}

const gate = item({
  approvalId: null,
  executionId: 'exec-1',
  id: 'workflow_review_gate:exec-1:gate-1',
  kind: 'workflow_review_gate',
  nodeId: 'gate-1',
  source: 'workflow',
  toolName: null,
  workflowId: 'wf-1',
});
const approval = item({});

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('review inbox source helpers', () => {
  it('filters rows by source and treats an empty filter as every source', () => {
    expect(filterReviewInboxItems([gate, approval], [])).toHaveLength(2);
    expect(filterReviewInboxItems([gate, approval], ['mcp_client'])).toEqual([
      approval,
    ]);
  });

  it('keeps agent drafts visible unless the filter leaves agents out', () => {
    expect(isAgentSourceVisible([])).toBe(true);
    expect(isAgentSourceVisible(['agent', 'workflow'])).toBe(true);
    expect(isAgentSourceVisible(['mcp_client'])).toBe(false);
  });
});

describe('useReviewInboxApprovals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fixture.searchParams = new URLSearchParams();
    fixture.getPendingItems.mockResolvedValue([gate, approval]);
    fixture.decide.mockResolvedValue({ status: 'approved' });
  });

  it('loads pending rows with an abort signal and filters by source', async () => {
    const { result } = renderHook(() => useReviewInboxApprovals(), {
      wrapper,
    });

    await waitFor(() => expect(result.current.items).toHaveLength(2));
    expect(fixture.getPendingItems).toHaveBeenCalledWith(
      expect.any(AbortSignal),
    );

    act(() => result.current.onSourceFilterChange(['workflow']));
    expect(result.current.items).toEqual([gate]);
  });

  it('resolves one row, tells MCP reviewers the client still has to run it, and reloads', async () => {
    const { result } = renderHook(() => useReviewInboxApprovals(), {
      wrapper,
    });
    await waitFor(() => expect(result.current.items).toHaveLength(2));

    await act(() => result.current.onDecide(approval, 'approve'));

    expect(fixture.decide).toHaveBeenCalledTimes(1);
    expect(fixture.decide).toHaveBeenCalledWith({
      decision: 'approve',
      itemId: 'mcp_approval:apr-1',
    });
    expect(fixture.notificationSuccess).toHaveBeenCalledWith(
      'Approved. The MCP client runs it the next time it asks.',
    );
    expect(fixture.getPendingItems).toHaveBeenCalledTimes(2);
  });

  it('reports a failed decision and reloads the server state', async () => {
    fixture.decide.mockRejectedValue(new Error('already resolved'));
    const { result } = renderHook(() => useReviewInboxApprovals(), {
      wrapper,
    });
    await waitFor(() => expect(result.current.items).toHaveLength(2));

    await act(() => result.current.onDecide(gate, 'reject'));

    expect(fixture.notificationError).toHaveBeenCalled();
    expect(fixture.getPendingItems).toHaveBeenCalledTimes(2);
    expect(result.current.decidingItemId).toBeNull();
  });

  it('flags an approval deep link whose row is no longer pending', async () => {
    fixture.searchParams = new URLSearchParams({
      approval: 'mcp_approval:gone',
    });
    const { result } = renderHook(() => useReviewInboxApprovals(), {
      wrapper,
    });

    await waitFor(() =>
      expect(result.current.isHighlightedItemMissing).toBe(true),
    );
    expect(result.current.highlightedItemId).toBe('mcp_approval:gone');
  });
});
