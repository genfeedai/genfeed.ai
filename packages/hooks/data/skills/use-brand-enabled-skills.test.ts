import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockUseBrand = vi.fn();
const mockResolveAuthToken = vi.fn();
const refreshBrandsMock = vi.fn();

vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => mockUseBrand(),
}));

vi.mock('@helpers/auth/auth.helper', () => ({
  resolveAuthToken: (...args: unknown[]) => mockResolveAuthToken(...args),
}));

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => ({ getToken: vi.fn() }),
}));

import { useBrandEnabledSkills } from './use-brand-enabled-skills';

function setBrand(
  enabledSkills: string[] | undefined,
  options: { brandId?: string; isReady?: boolean; hasBrand?: boolean } = {},
): void {
  const { brandId = 'brand-1', hasBrand = true, isReady = true } = options;
  mockUseBrand.mockReturnValue({
    isReady,
    refreshBrands: refreshBrandsMock,
    selectedBrand: hasBrand
      ? { agentConfig: { enabledSkills }, id: brandId }
      : null,
  });
}

describe('useBrandEnabledSkills', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValue({ ok: true });
    refreshBrandsMock.mockResolvedValue(undefined);
    mockResolveAuthToken.mockResolvedValue('token-abc');
    setBrand(['skill-a']);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('adopts the persisted enabled skills from the brand', async () => {
    const { result } = renderHook(() => useBrandEnabledSkills());

    await waitFor(() => {
      expect(result.current.enabledSlugs).toEqual(['skill-a']);
    });
    expect(result.current.isLoading).toBe(false);
  });

  it('clears slugs when there is no selected brand', async () => {
    setBrand(undefined, { hasBrand: false });

    const { result } = renderHook(() => useBrandEnabledSkills());

    await waitFor(() => {
      expect(result.current.enabledSlugs).toEqual([]);
    });
  });

  it('enables a skill optimistically and persists it', async () => {
    const { result } = renderHook(() => useBrandEnabledSkills());

    await waitFor(() => {
      expect(result.current.enabledSlugs).toEqual(['skill-a']);
    });

    await act(async () => {
      await result.current.toggleSkill('skill-b');
    });

    expect(result.current.enabledSlugs).toEqual(['skill-a', 'skill-b']);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/brands/brand-1/agent-config/enabled-skills'),
      expect.objectContaining({
        body: JSON.stringify({ enabledSkills: ['skill-a', 'skill-b'] }),
        headers: expect.objectContaining({
          Authorization: 'Bearer token-abc',
        }),
        method: 'PATCH',
      }),
    );
    expect(refreshBrandsMock).toHaveBeenCalledTimes(1);
  });

  it('disables an already-enabled skill', async () => {
    const { result } = renderHook(() => useBrandEnabledSkills());

    await waitFor(() => {
      expect(result.current.enabledSlugs).toEqual(['skill-a']);
    });

    await act(async () => {
      await result.current.toggleSkill('skill-a');
    });

    expect(result.current.enabledSlugs).toEqual([]);
  });

  it('rolls back the optimistic update when the request fails', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });

    const { result } = renderHook(() => useBrandEnabledSkills());

    await waitFor(() => {
      expect(result.current.enabledSlugs).toEqual(['skill-a']);
    });

    await act(async () => {
      await result.current.toggleSkill('skill-b');
    });

    expect(result.current.enabledSlugs).toEqual(['skill-a']);
  });

  it('rolls back when no auth token is available', async () => {
    mockResolveAuthToken.mockResolvedValue(null);

    const { result } = renderHook(() => useBrandEnabledSkills());

    await waitFor(() => {
      expect(result.current.enabledSlugs).toEqual(['skill-a']);
    });

    await act(async () => {
      await result.current.toggleSkill('skill-b');
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.enabledSlugs).toEqual(['skill-a']);
  });

  it('keeps a confirmed update when refreshing brand context fails', async () => {
    refreshBrandsMock.mockRejectedValue(new Error('refresh failed'));
    const { result } = renderHook(() => useBrandEnabledSkills());

    await waitFor(() => {
      expect(result.current.enabledSlugs).toEqual(['skill-a']);
    });

    await act(async () => {
      await result.current.toggleSkill('skill-b');
    });

    expect(result.current.enabledSlugs).toEqual(['skill-a', 'skill-b']);
    expect(result.current.isLoading).toBe(false);
  });

  it('ignores a second toggle while the first brand update is pending', async () => {
    let resolveRequest: ((value: { ok: boolean }) => void) | undefined;
    fetchMock.mockReturnValue(
      new Promise((resolve) => {
        resolveRequest = resolve;
      }),
    );
    const { result } = renderHook(() => useBrandEnabledSkills());

    await waitFor(() => {
      expect(result.current.enabledSlugs).toEqual(['skill-a']);
    });

    let firstToggle: Promise<void> | undefined;
    let secondToggle: Promise<void> | undefined;
    act(() => {
      firstToggle = result.current.toggleSkill('skill-b');
      secondToggle = result.current.toggleSkill('skill-c');
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    expect(result.current.enabledSlugs).toEqual(['skill-a', 'skill-b']);

    resolveRequest?.({ ok: true });
    await act(async () => {
      await Promise.all([firstToggle, secondToggle]);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.enabledSlugs).toEqual(['skill-a', 'skill-b']);
  });

  it('ignores toggles without a selected brand', async () => {
    setBrand(undefined, { hasBrand: false });

    const { result } = renderHook(() => useBrandEnabledSkills());

    await act(async () => {
      await result.current.toggleSkill('skill-b');
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.enabledSlugs).toEqual([]);
  });

  it('does not roll a failed request into a newly selected brand', async () => {
    let rejectRequest: ((reason?: unknown) => void) | undefined;
    fetchMock.mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectRequest = reject;
      }),
    );

    const { rerender, result } = renderHook(() => useBrandEnabledSkills());

    await waitFor(() => {
      expect(result.current.enabledSlugs).toEqual(['skill-a']);
    });

    let togglePromise: Promise<void> | undefined;
    act(() => {
      togglePromise = result.current.toggleSkill('skill-b');
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(true);
    });
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    setBrand(['skill-c'], { brandId: 'brand-2' });
    rerender();

    await waitFor(() => {
      expect(result.current.enabledSlugs).toEqual(['skill-c']);
      expect(result.current.isLoading).toBe(false);
    });

    rejectRequest?.(new Error('request failed'));
    await act(async () => {
      await togglePromise;
    });

    expect(result.current.enabledSlugs).toEqual(['skill-c']);
  });
});
