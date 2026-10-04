import { TagScope } from '@genfeedai/contracts';
import type { ITag } from '@genfeedai/contracts/interfaces';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useLibraryTags } from './use-library-tags';

const { identity, tagsService } = vi.hoisted(() => ({
  identity: { isSignedIn: true },
  tagsService: { createLibraryTag: vi.fn(), findLibraryTags: vi.fn() },
}));

vi.mock('@genfeedai/hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => identity,
}));

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

describe('useLibraryTags', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    identity.isSignedIn = true;
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

  it('asks for the active brand when none is given', async () => {
    const { result } = renderHook(() => useLibraryTags(), { wrapper });

    await waitFor(() => expect(result.current.tags).toEqual([launch]));
    expect(
      tagsService.findLibraryTags.mock.calls[0]?.[0].brandId,
    ).toBeUndefined();
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
