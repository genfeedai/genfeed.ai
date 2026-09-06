// @vitest-environment jsdom

import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
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
    const key = factory.toString();
    const existing = getterByFactory.get(key);
    if (existing) {
      return existing;
    }
    const getter = async () => factory('token');
    getterByFactory.set(key, getter);
    return getter;
  },
}));

vi.mock('@services/content/knowledge-sources.service', () => ({
  KnowledgeSourcesService: {
    getInstance: () => ({
      findForBrand: mocks.findForBrand,
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

import { useKnowledgeLibrary } from './use-knowledge-library';

describe('useKnowledgeLibrary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
