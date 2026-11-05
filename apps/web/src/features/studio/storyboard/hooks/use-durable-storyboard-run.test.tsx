import {
  createTestQueryClient,
  queryClientWrapper,
} from '@app-tests/query-client.harness';
import type { StoryboardRun } from '@genfeedai/contracts/api-types/contracts/storyboard-run.contract';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDurableStoryboardRun } from './use-durable-storyboard-run';

const mocks = vi.hoisted(() => ({
  brandId: 'brand-one',
  userId: 'user',
  sessionOrg: 'org',
  serviceLoads: vi.fn(),
  voices: vi.fn(),
  get: vi.fn(),
  update: vi.fn(),
  draft: vi.fn(),
}));
vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({ brandId: mocks.brandId, organizationId: 'org' }),
}));
vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => ({
    userId: mocks.userId,
    orgId: 'org',
    sessionId: 'session',
  }),
}));
vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ orgSlug: 'org' }),
}));
vi.mock('@genfeedai/auth-client', () => ({
  getSession: vi.fn(async () => ({
    data: {
      user: { id: mocks.userId },
      session: { activeOrganizationId: mocks.sessionOrg },
    },
  })),
}));
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => {
  const getService = async () => {
    mocks.serviceLoads();
    return {
      getStoryboardRun: mocks.get,
      updateStoryboardPlan: mocks.update,
      draftStoryboardPlan: mocks.draft,
      findAllPages: mocks.voices,
    };
  };
  return { useAuthedService: () => getService };
});
describe('brand-scoped durable storyboard loading', () => {
  beforeEach(() => {
    mocks.brandId = 'brand-one';
    mocks.get.mockReset();
    mocks.update.mockReset();
    mocks.draft.mockReset();
    mocks.voices.mockReset().mockResolvedValue([]);
    mocks.serviceLoads.mockReset();
    mocks.userId = 'user';
    mocks.sessionOrg = 'org';
    window.history.replaceState({}, '', '/org/brand-one/storyboard/run');
  });
  it('passes brand, run and cancellation signal and hides an old-brand response', async () => {
    let resolveOld:
      | ((run: {
          id: string;
          brandId: string;
          organizationId: string;
          config: { revision: number; plan: null };
        }) => void)
      | undefined;
    mocks.get
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveOld = resolve;
          }),
      )
      .mockResolvedValueOnce({
        id: 'run',
        brandId: 'brand-two',
        organizationId: 'org',
        config: { revision: 1, plan: null },
      });
    const { result, rerender } = renderHook(
      () => useDurableStoryboardRun('run'),
      {
        wrapper: queryClientWrapper(),
      },
    );
    await waitFor(() => expect(mocks.get).toHaveBeenCalledOnce());
    expect(mocks.get.mock.calls[0].slice(0, 2)).toEqual(['brand-one', 'run']);
    const oldSignal = mocks.get.mock.calls[0][2];
    mocks.brandId = 'brand-two';
    rerender();
    await waitFor(() => expect(result.current.run?.brandId).toBe('brand-two'));
    expect(oldSignal.aborted).toBe(true);
    await act(async () => {
      resolveOld?.({
        id: 'run',
        brandId: 'brand-one',
        organizationId: 'org',
        config: { revision: 1, plan: null },
      });
    });
    expect(result.current.run?.brandId).toBe('brand-two');
  });
  it('finishes an explicitly scoped detached save in the same organization without resolving fresh credentials', async () => {
    const run = persistedRun();
    mocks.get.mockResolvedValue(run);
    mocks.update.mockImplementation(async (_brand, _id, input) => ({
      ...run,
      config: {
        ...run.config,
        revision: input.expectedRevision + 1,
        plan: input.plan,
      },
    }));
    const { result, unmount } = renderHook(
      () => useDurableStoryboardRun('run'),
      {
        wrapper: queryClientWrapper(),
      },
    );
    await waitFor(() => expect(result.current.transport).toBeDefined());
    const transport = result.current.transport;
    if (!transport) throw new Error('Missing captured transport');
    unmount();
    window.history.replaceState({}, '', '/org/brand-two/playground');
    const serviceLoads = mocks.serviceLoads.mock.calls.length;
    const saved = await transport.write('plan', 1, {
      plan: { ...run.config.plan, title: 'Detached title' },
      source: run.config.sourceSnapshot.selector,
    });
    if (!saved.config.plan) throw new Error('Storyboard has no plan.');
    expect(saved.config.plan.title).toBe('Detached title');
    expect(mocks.update).toHaveBeenCalledWith(
      'brand-one',
      'run',
      expect.objectContaining({ expectedRevision: 1 }),
    );
    expect(mocks.serviceLoads).toHaveBeenCalledTimes(serviceLoads);
  });
  it.each(['user', 'organization', 'route'] as const)(
    'suspends captured detached writes after a %s switch before dispatch',
    async (changed) => {
      mocks.get.mockResolvedValue(persistedRun());
      const { result, unmount } = renderHook(
        () => useDurableStoryboardRun('run'),
        {
          wrapper: queryClientWrapper(),
        },
      );
      await waitFor(() => expect(result.current.transport).toBeDefined());
      const transport = result.current.transport;
      if (!transport) throw new Error('Missing captured transport');
      unmount();
      if (changed === 'user') mocks.userId = 'other-user';
      if (changed === 'organization') mocks.sessionOrg = 'other-org';
      if (changed === 'route')
        window.history.replaceState(
          {},
          '',
          '/other-org/brand-one/storyboard/run',
        );
      const run = persistedRun();
      await expect(
        transport.write('plan', 1, {
          plan: run.config.plan,
          source: run.config.sourceSnapshot.selector,
        }),
      ).rejects.toThrow('changed');
      expect(mocks.update).not.toHaveBeenCalled();
    },
  );
  it('drafts from the persisted revision and adopts the returned run', async () => {
    const run = persistedRun();
    mocks.get.mockResolvedValue(run);
    mocks.draft.mockImplementation(async (_brand, _id, input) => ({
      ...run,
      config: {
        ...run.config,
        revision: input.expectedRevision + 1,
        plan: { ...run.config.plan, title: 'Drafted title' },
      },
    }));
    const { result } = renderHook(() => useDurableStoryboardRun('run'), {
      wrapper: queryClientWrapper(),
    });
    await waitFor(() => expect(result.current.run).not.toBeNull());
    await act(async () => {
      await result.current.draftPlan('Shorten every shot');
    });
    expect(mocks.draft).toHaveBeenCalledWith('brand-one', 'run', {
      expectedRevision: 1,
      instruction: 'Shorten every shot',
    });
    await waitFor(() => expect(result.current.run?.config.revision).toBe(2));
    await act(async () => {
      await result.current.draftPlan();
    });
    expect(mocks.draft).toHaveBeenLastCalledWith('brand-one', 'run', {
      expectedRevision: 2,
    });
  });
  it('rejects a foreign canonical organization response before publishing a run', async () => {
    mocks.get.mockResolvedValue({
      ...persistedRun(),
      organizationId: 'foreign-org',
    });
    const { result } = renderHook(() => useDurableStoryboardRun('run'), {
      wrapper: queryClientWrapper(),
    });
    await waitFor(() =>
      expect(result.current.error).toContain('organization changed'),
    );
    expect(result.current.run).toBeNull();
    expect(result.current.transport).toBeUndefined();
  });
  it('rejects a response from another brand instead of rendering it', async () => {
    mocks.get.mockResolvedValue({ id: 'run', brandId: 'brand-other' });
    const { result } = renderHook(() => useDurableStoryboardRun('run'), {
      wrapper: queryClientWrapper(),
    });
    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.run).toBeNull();
  });
  it('paints the cached run at once when the storyboard is opened again', async () => {
    const client = createTestQueryClient();
    mocks.get.mockResolvedValue(persistedRun());
    const firstVisit = renderHook(() => useDurableStoryboardRun('run'), {
      wrapper: queryClientWrapper(client),
    });
    await waitFor(() =>
      expect(firstVisit.result.current.run?.config.plan?.title).toBe('Plan'),
    );
    firstVisit.unmount();

    mocks.get.mockImplementation(() => new Promise(() => {}));
    const { result } = renderHook(() => useDurableStoryboardRun('run'), {
      wrapper: queryClientWrapper(client),
    });

    expect(result.current.run?.config.plan?.title).toBe('Plan');
    expect(result.current.error).toBeNull();
    await waitFor(() => expect(result.current.transport).toBeDefined());
  });
  it('never paints one brand run under another brand', async () => {
    const client = createTestQueryClient();
    mocks.get.mockResolvedValue(persistedRun());
    const firstVisit = renderHook(() => useDurableStoryboardRun('run'), {
      wrapper: queryClientWrapper(client),
    });
    await waitFor(() => expect(firstVisit.result.current.run).not.toBeNull());
    firstVisit.unmount();

    mocks.brandId = 'brand-two';
    mocks.get.mockImplementation(() => new Promise(() => {}));
    const { result } = renderHook(() => useDurableStoryboardRun('run'), {
      wrapper: queryClientWrapper(client),
    });

    expect(result.current.run).toBeNull();
    expect(result.current.transport).toBeUndefined();
  });
  it('keeps the run on screen when a background read fails', async () => {
    const client = createTestQueryClient();
    mocks.get.mockResolvedValue(persistedRun());
    const { result } = renderHook(() => useDurableStoryboardRun('run'), {
      wrapper: queryClientWrapper(client),
    });
    await waitFor(() => expect(result.current.run).not.toBeNull());
    mocks.get.mockRejectedValue(new Error('offline'));

    act(() => result.current.refresh());

    await waitFor(() =>
      expect(
        client
          .getQueryCache()
          .find({ exact: false, queryKey: ['storyboard-run'] })?.state.status,
      ).toBe('error'),
    );
    expect(result.current.run?.config.plan?.title).toBe('Plan');
    expect(result.current.error).toBeNull();
  });
  it('keeps a newer saved revision over an older background read', async () => {
    const run = persistedRun();
    let resolveRead: ((value: StoryboardRun) => void) | undefined;
    mocks.get.mockResolvedValueOnce(run).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRead = resolve;
        }),
    );
    mocks.draft.mockResolvedValue({
      ...run,
      config: { ...run.config, revision: 2 },
    });
    const { result } = renderHook(() => useDurableStoryboardRun('run'), {
      wrapper: queryClientWrapper(),
    });
    await waitFor(() => expect(result.current.run).not.toBeNull());
    act(() => result.current.refresh());
    await waitFor(() => expect(resolveRead).toBeDefined());

    await act(async () => {
      await result.current.draftPlan();
    });
    await act(async () => resolveRead?.(run));

    await waitFor(() => expect(result.current.run?.config.revision).toBe(2));
  });
});

function persistedRun() {
  return {
    id: 'run',
    brandId: 'brand-one',
    organizationId: 'org',
    createdAt: '2026-09-30T00:00:00Z',
    updatedAt: '2026-09-30T00:00:00Z',
    config: {
      origin: 'native' as const,
      contract: 'storyboard-run' as const,
      version: 1 as const,
      revision: 1,
      clientRequestId: 'f86c1871-d577-4dca-b79d-6d9f295a58cc',
      createdByUserId: 'user',
      submittedInputHash: 'a'.repeat(64),
      state: 'storyboard' as const,
      sourceSnapshot: {
        selector: { kind: 'brief', brief: 'Idea' },
        capturedAt: '2026-09-30T00:00:00Z',
      },
      plan: {
        title: 'Plan',
        logline: '',
        format: '9:16' as const,
        videoModelKey: null,
        runtimeBudgetSeconds: 10,
        cast: [],
        styleReferenceAssetIds: [],
        shots: [],
      },
    },
  } satisfies StoryboardRun;
}
