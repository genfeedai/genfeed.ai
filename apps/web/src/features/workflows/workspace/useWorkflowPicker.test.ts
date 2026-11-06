import {
  createTestQueryClient,
  queryClientWrapper,
} from '@app-tests/query-client.harness';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkflowSummary } from '@/features/workflows/services/workflow-api';
import { useWorkflowPicker } from './useWorkflowPicker';

const { list } = vi.hoisted(() => ({ list: vi.fn() }));

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', async () => ({
  useAuthIdentity: (await import('@app-tests/query-client.harness'))
    .useTestViewer,
}));
vi.mock('@/features/workflows/services/workflow-api', () => ({
  createWorkflowApiService: () => ({ list }),
}));
vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn() },
}));

function workflow(id: string, brandId = 'brand-1'): WorkflowSummary {
  return {
    brandId,
    createdAt: '2026-07-13T08:00:00.000Z',
    id,
    label: `Workflow ${id}`,
    lifecycle: 'published',
    nodeCount: 3,
    updatedAt: '2026-07-13T08:00:00.000Z',
  };
}

function renderPicker(
  activeBrandId: string | null,
  client = createTestQueryClient(),
) {
  return renderHook(
    ({ brandId }: { brandId: string | null }) =>
      useWorkflowPicker({ activeBrandId: brandId }),
    {
      initialProps: { brandId: activeBrandId },
      wrapper: queryClientWrapper(client),
    },
  );
}

describe('useWorkflowPicker', () => {
  beforeEach(() => {
    list.mockReset();
  });

  it('lists the brand’s workflows', async () => {
    list.mockResolvedValue([workflow('a'), workflow('foreign', 'brand-2')]);
    const { result } = renderPicker('brand-1');

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.visibleWorkflows.map((item) => item.id)).toEqual([
      'a',
    ]);
  });

  it('paints the cached list at once when the picker is reopened', async () => {
    const client = createTestQueryClient();
    list.mockResolvedValue([workflow('a')]);
    const first = renderPicker('brand-1', client);
    await waitFor(() =>
      expect(first.result.current.visibleWorkflows).toHaveLength(1),
    );
    first.unmount();

    list.mockReturnValue(new Promise(() => {}));
    const { result } = renderPicker('brand-1', client);

    expect(result.current.isLoading).toBe(false);
    expect(result.current.visibleWorkflows.map((item) => item.id)).toEqual([
      'a',
    ]);
  });

  it('never paints one brand’s cached list for another brand', async () => {
    const client = createTestQueryClient();
    list.mockResolvedValue([workflow('a')]);
    const first = renderPicker('brand-1', client);
    await waitFor(() =>
      expect(first.result.current.visibleWorkflows).toHaveLength(1),
    );
    first.unmount();

    list.mockReturnValue(new Promise(() => {}));
    const { result } = renderPicker('brand-2', client);

    expect(result.current.isLoading).toBe(true);
    expect(result.current.visibleWorkflows).toEqual([]);
  });

  it('starts again at page 1 for a new brand', async () => {
    list.mockResolvedValue([]);
    const { result, rerender } = renderPicker('brand-1');
    act(() => result.current.setPage((current) => current + 1));
    expect(result.current.page).toBe(2);

    rerender({ brandId: 'brand-2' });

    expect(result.current.page).toBe(1);
  });

  it('shows an error only when no list is on screen, and retries', async () => {
    list.mockRejectedValue(new Error('Workflows are unavailable'));
    const { result } = renderPicker('brand-1');
    await waitFor(() =>
      expect(result.current.error).toBe('Workflows are unavailable'),
    );

    list.mockResolvedValue([workflow('a')]);
    act(() => result.current.retry());

    await waitFor(() =>
      expect(result.current.visibleWorkflows.map((item) => item.id)).toEqual([
        'a',
      ]),
    );
    expect(result.current.error).toBeNull();
  });
});
