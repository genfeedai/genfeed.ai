// @vitest-environment jsdom

import { KnowledgeProcessingState } from '@genfeedai/contracts';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authEpoch: 0,
  tokenWait: null as Promise<void> | null,
  findOne: vi.fn(),
  findForBrand: vi.fn(),
  findMemberships: vi.fn(),
  findSpaces: vi.fn(),
  findVersions: vi.fn(),
}));

// The real hook returns a stable getter; a fresh closure per render would
// recreate `load` and loop the effect.
const getterByFactory = new Map<string, () => Promise<unknown>>();
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: (factory: (token: string) => unknown) => {
    const key = `${mocks.authEpoch}:${factory.toString()}`;
    const existing = getterByFactory.get(key);
    if (existing) {
      return existing;
    }
    const getter = async () => {
      await mocks.tokenWait;
      return factory('token');
    };
    getterByFactory.set(key, getter);
    return getter;
  },
}));

vi.mock('@services/content/knowledge-sources.service', () => ({
  KnowledgeSourcesService: {
    getInstance: () => ({
      findForBrand: mocks.findForBrand,
      findOne: mocks.findOne,
      findVersions: mocks.findVersions,
    }),
  },
}));

vi.mock('@services/content/knowledge-spaces.service', () => ({
  KnowledgeSpacesService: {
    getInstance: () => ({
      findForBrand: mocks.findSpaces,
      findMemberships: mocks.findMemberships,
    }),
  },
}));

import {
  KNOWLEDGE_LIBRARY_POLL_INTERVAL_MS,
  useKnowledgeLibrary,
} from './use-knowledge-library';

describe('useKnowledgeLibrary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getterByFactory.clear();
    mocks.authEpoch = 0;
    mocks.tokenWait = null;
    mocks.findOne
      .mockReset()
      .mockResolvedValue({ id: 'offpage', title: 'Offpage' });
    mocks.findVersions.mockResolvedValue([
      { id: 'old', isCurrent: false, version: 1 },
      { id: 'current', isCurrent: true, version: 2 },
    ]);
    mocks.findMemberships.mockResolvedValue([
      { sourceId: 's1', spaceId: 'inbox' },
    ]);
    mocks.findSpaces.mockResolvedValue([{ id: 'inbox', isInbox: true }]);
  });

  it('folds the current version and space membership onto each source', async () => {
    mocks.findForBrand.mockResolvedValue([{ id: 's1', title: 'Pricing' }]);

    const { result } = renderHook(() =>
      useKnowledgeLibrary({ brandId: 'brand-a' }),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mocks.findForBrand).toHaveBeenCalledWith(
      { brandId: 'brand-a', limit: 25, page: 1 },
      expect.any(AbortSignal),
    );
    expect(result.current.rows).toEqual([
      {
        source: { id: 's1', title: 'Pricing' },
        spaceIds: ['inbox'],
        version: { id: 'current', isCurrent: true, version: 2 },
      },
    ]);
  });

  it('aborts the previous brand load and never mixes brands', async () => {
    let resolveFirst: (value: unknown[]) => void = () => undefined;
    mocks.findForBrand
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValueOnce([{ id: 's2', title: 'Brand B source' }]);
    mocks.findMemberships.mockResolvedValue([]);

    const { rerender, result } = renderHook(
      ({ brandId }: { brandId: string }) => useKnowledgeLibrary({ brandId }),
      { initialProps: { brandId: 'brand-a' } },
    );
    await waitFor(() => expect(mocks.findForBrand).toHaveBeenCalledTimes(1));
    rerender({ brandId: 'brand-b' });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.rows.map((row) => row.source.id)).toEqual(['s2']);
    const firstSignal = mocks.findForBrand.mock.calls[0]?.[1] as AbortSignal;
    expect(firstSignal.aborted).toBe(true);
    resolveFirst([{ id: 's1', title: 'Brand A source' }]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(result.current.rows.map((row) => row.source.id)).toEqual(['s2']);
  });

  it('reports a load error without leaking partial rows', async () => {
    mocks.findForBrand.mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() =>
      useKnowledgeLibrary({ brandId: 'brand-a' }),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBe('Knowledge could not be loaded.');
    expect(result.current.rows).toEqual([]);
  });

  it('loads one offpage selected source with scoped current version and memberships without changing the page', async () => {
    const page = Array.from({ length: 25 }, (_, index) => ({
      id: `s${index}`,
    }));
    mocks.findForBrand.mockResolvedValue(page);
    mocks.findMemberships.mockResolvedValue([{ sourceId: 'offpage' }]);
    const { result } = renderHook(() =>
      useKnowledgeLibrary({
        brandId: 'brand-a',
        page: 3,
        selectedSourceId: 'offpage',
      }),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mocks.findOne).toHaveBeenCalledWith(
      'offpage',
      { brandId: 'brand-a' },
      expect.any(AbortSignal),
    );
    expect(mocks.findVersions).toHaveBeenCalledWith(
      'offpage',
      'brand-a',
      expect.any(AbortSignal),
    );
    expect(result.current.rows.map((row) => row.source.id)).toEqual(
      page.map((source) => source.id),
    );
    expect(result.current.selectedRow).toMatchObject({
      source: { id: 'offpage' },
      spaceIds: ['inbox'],
      version: { id: 'current' },
    });
    expect(mocks.findForBrand).toHaveBeenCalledWith(
      { brandId: 'brand-a', page: 3, limit: 25 },
      expect.any(AbortSignal),
    );
  });

  it('reuses the freshly scoped onpage row without an extra source or versions read', async () => {
    mocks.findForBrand.mockResolvedValue([{ id: 's1' }]);
    const { result } = renderHook(() =>
      useKnowledgeLibrary({ brandId: 'brand-a', selectedSourceId: 's1' }),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.selectedRow).toBe(result.current.rows[0]);
    expect(mocks.findOne).not.toHaveBeenCalled();
    expect(mocks.findVersions).toHaveBeenCalledTimes(1);
  });

  it.each(['', 'bad/id', 'a'.repeat(129), 'a\n', 'é'])(
    'never dispatches a selected-source read for invalid ID %j',
    async (selectedSourceId) => {
      mocks.findForBrand.mockResolvedValue([]);
      const { result } = renderHook(() =>
        useKnowledgeLibrary({ brandId: 'brand-a', selectedSourceId }),
      );
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(mocks.findOne).not.toHaveBeenCalled();
      expect(result.current.selectedRow).toBeNull();
      expect(result.current.selectionError).toBe(
        'Knowledge could not be loaded.',
      );
    },
  );

  it('clears the selected onpage panel when its version read is denied, preserving the separate page', async () => {
    mocks.findForBrand.mockResolvedValue([{ id: 's1' }]);
    mocks.findVersions.mockRejectedValue(new Error('PRIVATE_VERSION_DENIAL'));
    const { result } = renderHook(() =>
      useKnowledgeLibrary({ brandId: 'brand-a', selectedSourceId: 's1' }),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.selectedRow).toBeNull();
    expect(result.current.selectionError).toBe(
      'Knowledge could not be loaded.',
    );
    expect(result.current.error).toBeNull();
    expect(result.current.rows.map((row) => row.source.id)).toEqual(['s1']);
    expect(mocks.findOne).not.toHaveBeenCalled();
  });

  it('does not read a selected source without a brand', async () => {
    const { result } = renderHook(() =>
      useKnowledgeLibrary({ brandId: undefined, selectedSourceId: 'offpage' }),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mocks.findOne).not.toHaveBeenCalled();
  });

  it.each([403, 404, 'wrong-id'])(
    'rejects selected-source denial or mismatched identity %s with generic text and keeps the page',
    async (failure) => {
      mocks.findForBrand.mockResolvedValue([{ id: 's1' }]);
      if (failure === 'wrong-id')
        mocks.findOne.mockResolvedValue({ id: 'other', title: 'SENSITIVE' });
      else mocks.findOne.mockRejectedValue(new Error(`SENSITIVE ${failure}`));
      const { result } = renderHook(() =>
        useKnowledgeLibrary({
          brandId: 'brand-a',
          selectedSourceId: 'offpage',
        }),
      );
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.selectedRow).toBeNull();
      expect(result.current.selectionError).toBe(
        'Knowledge could not be loaded.',
      );
      expect(result.current.error).toBeNull();
      expect(result.current.rows).toHaveLength(1);
    },
  );

  it.each(['brand', 'actor', 'session', 'organization'])(
    'prevents HTTP dispatch after delayed token resolution and %s scope change',
    async (change) => {
      let complete!: () => void;
      mocks.tokenWait = new Promise<void>((resolve) => {
        complete = resolve;
      });
      mocks.findForBrand.mockResolvedValue([]);
      const { rerender, result } = renderHook(
        ({ brandId }) =>
          useKnowledgeLibrary({ brandId, selectedSourceId: 'offpage' }),
        { initialProps: { brandId: 'brand-a' } },
      );
      if (change !== 'brand') mocks.authEpoch++;
      mocks.tokenWait = null;
      rerender({ brandId: change === 'brand' ? 'brand-b' : 'brand-a' });
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      const count = mocks.findForBrand.mock.calls.length;
      await act(async () => {
        complete();
      });
      expect(mocks.findForBrand).toHaveBeenCalledTimes(count);
      expect(mocks.findOne).toHaveBeenCalledTimes(1);
    },
  );

  it.each(['brand', 'identity', 'selection', 'close', 'unmount'])(
    'ignores a delayed selected-source response after %s',
    async (change) => {
      let complete!: (source: { id: string; title: string }) => void;
      mocks.findForBrand.mockResolvedValue([]);
      mocks.findOne.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            complete = resolve;
          }),
      );
      const { rerender, result, unmount } = renderHook(
        ({ brandId, selectedSourceId }) =>
          useKnowledgeLibrary({ brandId, selectedSourceId }),
        {
          initialProps: {
            brandId: 'brand-a',
            selectedSourceId: 'offpage' as string | undefined,
          },
        },
      );
      await waitFor(() => expect(mocks.findOne).toHaveBeenCalledTimes(1));
      const signal = mocks.findOne.mock.calls[0][2] as AbortSignal;
      if (change === 'unmount') unmount();
      else {
        if (change === 'identity') mocks.authEpoch++;
        mocks.findOne.mockResolvedValue({ id: 'next', title: 'Next' });
        rerender({
          brandId: change === 'brand' ? 'brand-b' : 'brand-a',
          selectedSourceId: change === 'close' ? undefined : 'next',
        });
        await waitFor(() => expect(result.current.isLoading).toBe(false));
      }
      expect(signal.aborted).toBe(true);
      await act(async () => {
        complete({ id: 'offpage', title: 'SENSITIVE_OLD' });
      });
      if (change !== 'unmount')
        expect(result.current.selectedRow?.source.title).not.toBe(
          'SENSITIVE_OLD',
        );
    },
  );

  it.each(['brand', 'actor', 'session', 'organization', 'selection'])(
    'ignores a delayed selected version after %s scope changes',
    async (change) => {
      let complete!: (versions: unknown[]) => void;
      mocks.findForBrand.mockResolvedValue([]);
      mocks.findVersions.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            complete = resolve;
          }),
      );
      const { result, rerender } = renderHook(
        ({ brandId, selectedSourceId }) =>
          useKnowledgeLibrary({ brandId, selectedSourceId }),
        { initialProps: { brandId: 'brand-a', selectedSourceId: 'offpage' } },
      );
      await waitFor(() => expect(mocks.findVersions).toHaveBeenCalledTimes(1));
      const signal = mocks.findVersions.mock.calls[0][2] as AbortSignal;
      if (['actor', 'session', 'organization'].includes(change))
        mocks.authEpoch++;
      mocks.findOne.mockResolvedValue({ id: 'next', title: 'Next' });
      mocks.findVersions.mockResolvedValue([{ id: 'safe', isCurrent: true }]);
      rerender({
        brandId: change === 'brand' ? 'brand-b' : 'brand-a',
        selectedSourceId: 'next',
      });
      await waitFor(() =>
        expect(result.current.selectedRow?.version?.id).toBe('safe'),
      );
      expect(signal.aborted).toBe(true);
      await act(async () => {
        complete([{ id: 'SENSITIVE_OLD_VERSION', isCurrent: true }]);
      });
      expect(result.current.selectedRow?.version?.id).toBe('safe');
    },
  );

  it('does not dispatch after token resolution when the hook was unmounted', async () => {
    let complete!: () => void;
    mocks.tokenWait = new Promise<void>((resolve) => {
      complete = resolve;
    });
    const { unmount } = renderHook(() =>
      useKnowledgeLibrary({ brandId: 'brand-a', selectedSourceId: 'offpage' }),
    );
    unmount();
    await act(async () => {
      complete();
    });
    expect(mocks.findForBrand).not.toHaveBeenCalled();
    expect(mocks.findOne).not.toHaveBeenCalled();
  });

  it('uses the newest bounded version fallback when no returned version is current', async () => {
    mocks.findForBrand.mockResolvedValue([]);
    mocks.findVersions.mockResolvedValue([
      { id: 'latest', isCurrent: false },
      { id: 'older', isCurrent: false },
    ]);
    const { result } = renderHook(() =>
      useKnowledgeLibrary({ brandId: 'brand-a', selectedSourceId: 'offpage' }),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.selectedRow?.version?.id).toBe('latest');
  });

  it('accepts a 128-character ASCII source ID without normalization', async () => {
    const id = `A_${'z'.repeat(125)}-`;
    mocks.findForBrand.mockResolvedValue([]);
    mocks.findOne.mockResolvedValue({ id });
    const { result } = renderHook(() =>
      useKnowledgeLibrary({ brandId: 'brand-a', selectedSourceId: id }),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.selectedRow?.source.id).toBe(id);
    expect(mocks.findOne).toHaveBeenCalledWith(
      id,
      { brandId: 'brand-a' },
      expect.any(AbortSignal),
    );
  });

  it('clears actionable selected details after a refresh denial and reloads updated offpage details', async () => {
    mocks.findForBrand.mockResolvedValue([]);
    const { result } = renderHook(() =>
      useKnowledgeLibrary({ brandId: 'brand-a', selectedSourceId: 'offpage' }),
    );
    await waitFor(() =>
      expect(result.current.selectedRow?.source.id).toBe('offpage'),
    );
    mocks.findOne.mockRejectedValueOnce(new Error('SENSITIVE_DENIAL'));
    await act(() => result.current.refresh());
    expect(result.current.selectedRow).toBeNull();
    expect(result.current.selectionError).toBe(
      'Knowledge could not be loaded.',
    );
    mocks.findOne.mockResolvedValue({ id: 'offpage', title: 'Updated' });
    await act(() => result.current.refresh());
    expect(result.current.selectedRow?.source.title).toBe('Updated');
  });

  it('clears offpage actionable details after a denied background poll', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      mocks.findForBrand.mockResolvedValue([{ id: 's1' }]);
      mocks.findVersions.mockResolvedValue([
        {
          isCurrent: true,
          processingState: KnowledgeProcessingState.PROCESSING,
        },
      ]);
      const { result } = renderHook(() =>
        useKnowledgeLibrary({
          brandId: 'brand-a',
          selectedSourceId: 'offpage',
        }),
      );
      await waitFor(() =>
        expect(result.current.selectedRow?.source.id).toBe('offpage'),
      );
      mocks.findOne.mockRejectedValue(new Error('PRIVATE_DENIED_POLL'));
      await act(() =>
        vi.advanceTimersByTimeAsync(KNOWLEDGE_LIBRARY_POLL_INTERVAL_MS),
      );
      expect(result.current.selectedRow).toBeNull();
      expect(result.current.selectionError).toBe(
        'Knowledge could not be loaded.',
      );
      expect(result.current.rows.map((row) => row.source.id)).toEqual(['s1']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('polls a selected offpage pending version through processing to ready then stops', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      mocks.findForBrand.mockResolvedValue([]);
      mocks.findVersions
        .mockResolvedValueOnce([
          { isCurrent: true, processingState: KnowledgeProcessingState.QUEUED },
        ])
        .mockResolvedValueOnce([
          {
            isCurrent: true,
            processingState: KnowledgeProcessingState.PROCESSING,
          },
        ])
        .mockResolvedValue([
          { isCurrent: true, processingState: KnowledgeProcessingState.READY },
        ]);
      const { result } = renderHook(() =>
        useKnowledgeLibrary({
          brandId: 'brand-a',
          selectedSourceId: 'offpage',
        }),
      );
      await waitFor(() =>
        expect(result.current.selectedRow?.version?.processingState).toBe(
          KnowledgeProcessingState.QUEUED,
        ),
      );
      await act(() =>
        vi.advanceTimersByTimeAsync(KNOWLEDGE_LIBRARY_POLL_INTERVAL_MS),
      );
      expect(result.current.selectedRow?.version?.processingState).toBe(
        KnowledgeProcessingState.PROCESSING,
      );
      await act(() =>
        vi.advanceTimersByTimeAsync(KNOWLEDGE_LIBRARY_POLL_INTERVAL_MS),
      );
      expect(result.current.selectedRow?.version?.processingState).toBe(
        KnowledgeProcessingState.READY,
      );
      const count = mocks.findOne.mock.calls.length;
      await act(() =>
        vi.advanceTimersByTimeAsync(KNOWLEDGE_LIBRARY_POLL_INTERVAL_MS * 2),
      );
      expect(mocks.findOne).toHaveBeenCalledTimes(count);
    } finally {
      vi.useRealTimers();
    }
  });

  describe('while ingestion is pending', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    function currentVersion(processingState: KnowledgeProcessingState) {
      return [{ id: 'current', isCurrent: true, processingState, version: 1 }];
    }

    it('re-reads in the background until the version settles, then stops', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      mocks.findForBrand.mockResolvedValue([{ id: 's1', title: 'Pricing' }]);
      mocks.findVersions
        .mockResolvedValueOnce(currentVersion(KnowledgeProcessingState.QUEUED))
        .mockResolvedValueOnce(
          currentVersion(KnowledgeProcessingState.PROCESSING),
        )
        .mockResolvedValue(currentVersion(KnowledgeProcessingState.READY));

      const { result } = renderHook(() =>
        useKnowledgeLibrary({ brandId: 'brand-a' }),
      );
      await waitFor(() =>
        expect(result.current.rows[0]?.version?.processingState).toBe(
          KnowledgeProcessingState.QUEUED,
        ),
      );

      await act(() =>
        vi.advanceTimersByTimeAsync(KNOWLEDGE_LIBRARY_POLL_INTERVAL_MS),
      );
      await waitFor(() =>
        expect(result.current.rows[0]?.version?.processingState).toBe(
          KnowledgeProcessingState.PROCESSING,
        ),
      );
      expect(result.current.isLoading).toBe(false);

      await act(() =>
        vi.advanceTimersByTimeAsync(KNOWLEDGE_LIBRARY_POLL_INTERVAL_MS),
      );
      await waitFor(() =>
        expect(result.current.rows[0]?.version?.processingState).toBe(
          KnowledgeProcessingState.READY,
        ),
      );

      const reads = mocks.findForBrand.mock.calls.length;
      await act(() =>
        vi.advanceTimersByTimeAsync(KNOWLEDGE_LIBRARY_POLL_INTERVAL_MS * 3),
      );
      expect(mocks.findForBrand).toHaveBeenCalledTimes(reads);
    });

    it('keeps the rows when a background read fails', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      mocks.findForBrand
        .mockResolvedValueOnce([{ id: 's1', title: 'Pricing' }])
        .mockRejectedValue(new Error('network'));
      mocks.findVersions.mockResolvedValue(
        currentVersion(KnowledgeProcessingState.PROCESSING),
      );

      const { result } = renderHook(() =>
        useKnowledgeLibrary({ brandId: 'brand-a' }),
      );
      await waitFor(() => expect(result.current.rows).toHaveLength(1));

      await act(() =>
        vi.advanceTimersByTimeAsync(KNOWLEDGE_LIBRARY_POLL_INTERVAL_MS),
      );

      expect(mocks.findForBrand).toHaveBeenCalledTimes(2);
      expect(result.current.rows.map((row) => row.source.id)).toEqual(['s1']);
      expect(result.current.error).toBeNull();
    });
  });
});
