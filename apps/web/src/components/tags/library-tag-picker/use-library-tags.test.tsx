import { TagScope } from '@genfeedai/contracts';
import type { ITag } from '@genfeedai/contracts/interfaces';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useLibraryTags } from './use-library-tags';

const { identity, scope, tagsService } = vi.hoisted(() => ({
  identity: { isSignedIn: true },
  scope: {
    brandId: 'brand-1' as string | undefined,
    isReady: true,
    organizationId: 'org-1',
    pageScope: 'brand' as 'brand' | 'org',
  },
  tagsService: { createLibraryTag: vi.fn(), findLibraryTags: vi.fn() },
}));

vi.mock('@genfeedai/hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => identity,
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

vi.mock('@genfeedai/hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => tagsService,
}));

vi.mock('@genfeedai/services/content/tags.service', () => ({
  TagsService: { getInstance: () => tagsService },
}));

const launch = { id: 'tag-1', label: 'Launch' } as ITag;

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function stableWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe('useLibraryTags', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    identity.isSignedIn = true;
    scope.brandId = 'brand-1';
    scope.isReady = true;
    scope.pageScope = 'brand';
    tagsService.findLibraryTags.mockResolvedValue([launch]);
  });

  it('loads the tags of the brand it was asked for', async () => {
    const { result } = renderHook(
      () => useLibraryTags({ brandId: 'brand-1' }),
      {
        wrapper,
      },
    );

    await waitFor(() => expect(result.current.tags).toEqual([launch]));
    expect(tagsService.findLibraryTags).toHaveBeenCalledWith(
      expect.objectContaining({ brandId: 'brand-1' }),
    );
  });

  it('asks for the brand in the URL when none is given', async () => {
    const { result } = renderHook(() => useLibraryTags(), { wrapper });

    await waitFor(() => expect(result.current.tags).toEqual([launch]));
    expect(tagsService.findLibraryTags.mock.calls[0]?.[0].brandId).toBe(
      'brand-1',
    );
  });

  it('shows the new brand tags after the active brand switches', async () => {
    const tagA = { id: 'tag-a', label: 'Brand A' } as ITag;
    const tagB = { id: 'tag-b', label: 'Brand B' } as ITag;
    tagsService.findLibraryTags.mockImplementation(
      async ({ brandId }: { brandId?: string }) =>
        brandId === 'brand-b' ? [tagB] : [tagA],
    );
    scope.brandId = 'brand-a';
    const { result, rerender } = renderHook(() => useLibraryTags(), {
      wrapper: stableWrapper(),
    });
    await waitFor(() => expect(result.current.tags).toEqual([tagA]));

    scope.brandId = 'brand-b';
    rerender();

    await waitFor(() => expect(result.current.tags).toEqual([tagB]));
  });

  it('does not load while the brand route has no brand id yet', () => {
    scope.brandId = undefined;
    const { result } = renderHook(() => useLibraryTags(), { wrapper });

    expect(result.current.tags).toEqual([]);
    expect(tagsService.findLibraryTags).not.toHaveBeenCalled();
  });

  it('does not load while signed out or disabled', async () => {
    identity.isSignedIn = false;
    const { result, rerender } = renderHook(
      ({ isEnabled }) => useLibraryTags({ isEnabled }),
      { initialProps: { isEnabled: true }, wrapper },
    );

    rerender({ isEnabled: false });

    expect(result.current.tags).toEqual([]);
    expect(tagsService.findLibraryTags).not.toHaveBeenCalled();
  });

  it('creates a tag in the requested scope, or reuses the existing one', async () => {
    tagsService.createLibraryTag.mockResolvedValue(launch);
    const { result } = renderHook(
      () => useLibraryTags({ brandId: 'brand-1' }),
      {
        wrapper,
      },
    );
    await waitFor(() => expect(result.current.tags).toHaveLength(1));

    let created: ITag | undefined;
    await act(async () => {
      created = await result.current.createTag('Launch', TagScope.ORGANIZATION);
    });

    expect(created).toBe(launch);
    expect(tagsService.createLibraryTag).toHaveBeenCalledWith(
      'Launch',
      TagScope.ORGANIZATION,
      undefined,
    );
    // Creating refreshes every Library tag list.
    await waitFor(() =>
      expect(tagsService.findLibraryTags.mock.calls.length).toBeGreaterThan(1),
    );
  });

  it('surfaces a failed create to the caller', async () => {
    tagsService.createLibraryTag.mockRejectedValue(new Error('403'));
    const { result } = renderHook(
      () => useLibraryTags({ brandId: 'brand-1' }),
      {
        wrapper,
      },
    );

    await expect(result.current.createTag('Nope')).rejects.toThrow('403');
  });
});
