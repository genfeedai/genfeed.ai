import {
  createTestQueryClient,
  queryClientWrapper,
} from '@app-tests/query-client.harness';
import type {
  IAgentBrandContextSnapshot,
  IAgentMemoryEntry,
  IBrandMemoryInsight,
} from '@genfeedai/contracts/interfaces';
import type { AgentBrandContextService } from '@services/automation/agent-brand-context.service';
import type { AgentMemoriesService } from '@services/automation/agent-memories.service';
import type { BrandMemoryService } from '@services/automation/brand-memory.service';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAgentContextPage } from './use-agent-context-page';

const mocks = vi.hoisted(() => ({
  archivePersonal: vi.fn<AgentMemoriesService['archivePersonal']>(),
  brand: { brandId: 'brand-1', isReady: true },
  getInsights: vi.fn<BrandMemoryService['getInsights']>(),
  getSnapshot: vi.fn<AgentBrandContextService['getSnapshot']>(),
  listForBrand: vi.fn<AgentMemoriesService['listForBrand']>(),
  listPersonal: vi.fn<AgentMemoriesService['listPersonal']>(),
}));

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', async () => ({
  useAuthIdentity: (await import('@app-tests/query-client.harness'))
    .useTestViewer,
}));
vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => mocks.brand,
}));
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn() },
}));
vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({ error: vi.fn(), success: vi.fn() }),
  },
}));
vi.mock('@services/automation/agent-brand-context.service', () => ({
  AgentBrandContextService: {
    getInstance: () => ({ getSnapshot: mocks.getSnapshot }),
  },
}));
vi.mock('@services/automation/brand-memory.service', () => ({
  BrandMemoryService: {
    getInstance: () => ({ getInsights: mocks.getInsights }),
  },
}));
vi.mock('@services/automation/agent-memories.service', () => ({
  AgentMemoriesService: {
    getInstance: () => ({
      archivePersonal: mocks.archivePersonal,
      listForBrand: mocks.listForBrand,
      listPersonal: mocks.listPersonal,
    }),
  },
}));

function snapshot(query = ''): IAgentBrandContextSnapshot {
  return {
    brandId: 'brand-1',
    brandName: 'Acme',
    query,
    systemPrompt: `PROMPT ${query}`,
  } as IAgentBrandContextSnapshot;
}

const INSIGHT: IBrandMemoryInsight = {
  category: 'timing',
  confidence: 0.8,
  id: 'insight-1',
  insight: 'Evenings win',
};
const PERSONAL: IAgentMemoryEntry = {
  id: 'memory-1',
  scope: 'personal',
  summary: 'Prefers short hooks',
};
const BRAND_MEMORY: IAgentMemoryEntry = {
  id: 'memory-2',
  scope: 'brand',
  summary: 'Launches on Tuesdays',
};

function never<T>(): Promise<T> {
  return new Promise<T>(() => undefined);
}

describe('useAgentContextPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.brand = { brandId: 'brand-1', isReady: true };
    mocks.getSnapshot.mockImplementation(async (_brandId, options) =>
      snapshot(options?.query ?? ''),
    );
    mocks.getInsights.mockResolvedValue([INSIGHT]);
    mocks.listPersonal.mockResolvedValue([PERSONAL]);
    mocks.listForBrand.mockResolvedValue([BRAND_MEMORY]);
    mocks.archivePersonal.mockResolvedValue(PERSONAL);
  });

  it('loads the snapshot, insights and memories for the brand', async () => {
    const { result } = renderHook(() => useAgentContextPage(), {
      wrapper: queryClientWrapper(),
    });

    await waitFor(() => expect(result.current.snapshot).toEqual(snapshot()));
    await waitFor(() => expect(result.current.insights).toEqual([INSIGHT]));
    await waitFor(() =>
      expect(result.current.personalMemories).toEqual([PERSONAL]),
    );
    expect(result.current.brandMemories).toEqual([BRAND_MEMORY]);
    expect(result.current.isLoadError).toBe(false);
  });

  it('paints the cached context at once when the page is opened again', async () => {
    const client = createTestQueryClient();
    const first = renderHook(() => useAgentContextPage(), {
      wrapper: queryClientWrapper(client),
    });
    await waitFor(() =>
      expect(first.result.current.personalMemories).toEqual([PERSONAL]),
    );
    await waitFor(() =>
      expect(first.result.current.insights).toEqual([INSIGHT]),
    );
    await waitFor(() =>
      expect(first.result.current.snapshot).toEqual(snapshot()),
    );
    first.unmount();

    mocks.getSnapshot.mockReturnValue(never());
    mocks.getInsights.mockReturnValue(never());
    mocks.listPersonal.mockReturnValue(never());
    const { result } = renderHook(() => useAgentContextPage(), {
      wrapper: queryClientWrapper(client),
    });

    expect(result.current.snapshot).toEqual(snapshot());
    expect(result.current.insights).toEqual([INSIGHT]);
    expect(result.current.personalMemories).toEqual([PERSONAL]);
    expect(result.current.brandMemories).toEqual([BRAND_MEMORY]);
  });

  it('never shows another brand the context cached for this one', async () => {
    const client = createTestQueryClient();
    const first = renderHook(() => useAgentContextPage(), {
      wrapper: queryClientWrapper(client),
    });
    await waitFor(() =>
      expect(first.result.current.snapshot).toEqual(snapshot()),
    );
    first.unmount();

    mocks.brand = { brandId: 'brand-2', isReady: true };
    mocks.getSnapshot.mockReturnValue(never());
    mocks.getInsights.mockReturnValue(never());
    mocks.listPersonal.mockReturnValue(never());
    const { result } = renderHook(() => useAgentContextPage(), {
      wrapper: queryClientWrapper(client),
    });

    expect(result.current.snapshot).toBeNull();
    expect(result.current.insights).toBeNull();
    expect(result.current.brandMemories).toBeNull();
  });

  it('keeps the current snapshot on screen while a preview loads', async () => {
    const { result } = renderHook(() => useAgentContextPage(), {
      wrapper: queryClientWrapper(),
    });
    await waitFor(() => expect(result.current.snapshot).toEqual(snapshot()));

    mocks.getSnapshot.mockReturnValue(never());
    act(() => result.current.preview('  launch week '));

    await waitFor(() => expect(result.current.isRefreshing).toBe(true));
    expect(result.current.snapshot).toEqual(snapshot());
    expect(mocks.getSnapshot).toHaveBeenLastCalledWith(
      'brand-1',
      expect.objectContaining({ query: 'launch week' }),
    );
  });

  it('keeps the snapshot when a refresh fails and reports a first-load failure', async () => {
    const { result } = renderHook(() => useAgentContextPage(), {
      wrapper: queryClientWrapper(),
    });
    await waitFor(() => expect(result.current.snapshot).toEqual(snapshot()));

    mocks.getSnapshot.mockRejectedValue(new Error('offline'));
    act(() => result.current.refresh());

    await waitFor(() => expect(result.current.isRefreshing).toBe(false));
    expect(result.current.snapshot).toEqual(snapshot());
    expect(result.current.isLoadError).toBe(false);

    const failed = renderHook(() => useAgentContextPage(), {
      wrapper: queryClientWrapper(),
    });
    await waitFor(() => expect(failed.result.current.isLoadError).toBe(true));
    expect(failed.result.current.snapshot).toBeNull();
  });

  it('shows empty lists with an error when insights and memories fail', async () => {
    mocks.getInsights.mockRejectedValue(new Error('offline'));
    mocks.listPersonal.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useAgentContextPage(), {
      wrapper: queryClientWrapper(),
    });

    await waitFor(() => expect(result.current.isInsightsError).toBe(true));
    await waitFor(() => expect(result.current.isMemoriesError).toBe(true));
    expect(result.current.insights).toEqual([]);
    expect(result.current.personalMemories).toEqual([]);
    expect(result.current.brandMemories).toEqual([]);
  });

  it('drops an archived personal memory from the cached list', async () => {
    const client = createTestQueryClient();
    const first = renderHook(() => useAgentContextPage(), {
      wrapper: queryClientWrapper(client),
    });
    await waitFor(() =>
      expect(first.result.current.personalMemories).toEqual([PERSONAL]),
    );

    await act(async () => {
      await first.result.current.archivePersonalMemory('memory-1');
    });

    await waitFor(() =>
      expect(first.result.current.personalMemories).toEqual([]),
    );
    expect(first.result.current.pendingMemoryId).toBeNull();
    first.unmount();

    mocks.listPersonal.mockReturnValue(never());
    const { result } = renderHook(() => useAgentContextPage(), {
      wrapper: queryClientWrapper(client),
    });
    expect(result.current.personalMemories).toEqual([]);
  });
});
