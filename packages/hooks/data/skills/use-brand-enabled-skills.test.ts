import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

const updateEnabledSkillsMock = vi.fn();

vi.mock('@services/social/brands.service', () => ({
  BrandsService: {
    getInstance: () => ({ updateEnabledSkills: updateEnabledSkillsMock }),
  },
}));

import { useBrandEnabledSkills } from './use-brand-enabled-skills';

function setBrand(
  enabledSkills: string[] | undefined,
  options: {
    brandId?: string;
    isReady?: boolean;
    hasBrand?: boolean;
    useDefaultSkills?: boolean;
  } = {},
): void {
  const {
    brandId = 'brand-1',
    hasBrand = true,
    isReady = true,
    useDefaultSkills,
  } = options;
  mockUseBrand.mockReturnValue({
    isReady,
    refreshBrands: refreshBrandsMock,
    selectedBrand: hasBrand
      ? { agentConfig: { enabledSkills, useDefaultSkills }, id: brandId }
      : null,
  });
}

describe('useBrandEnabledSkills', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateEnabledSkillsMock.mockResolvedValue(undefined);
    refreshBrandsMock.mockResolvedValue(undefined);
    mockResolveAuthToken.mockResolvedValue('token-abc');
    setBrand(['skill-a']);
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
    expect(updateEnabledSkillsMock).toHaveBeenCalledWith('brand-1', {
      enabledSkills: ['skill-a', 'skill-b'],
      useDefaultSkills: false,
    });
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
    updateEnabledSkillsMock.mockRejectedValue(new Error('500'));

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

    expect(updateEnabledSkillsMock).not.toHaveBeenCalled();
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
    let resolveRequest: (() => void) | undefined;
    updateEnabledSkillsMock.mockReturnValue(
      new Promise<void>((resolve) => {
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
      expect(updateEnabledSkillsMock).toHaveBeenCalledTimes(1);
    });
    expect(result.current.enabledSlugs).toEqual(['skill-a', 'skill-b']);

    resolveRequest?.();
    await act(async () => {
      await Promise.all([firstToggle, secondToggle]);
    });

    expect(updateEnabledSkillsMock).toHaveBeenCalledTimes(1);
    expect(result.current.enabledSlugs).toEqual(['skill-a', 'skill-b']);
  });

  it('ignores toggles without a selected brand', async () => {
    setBrand(undefined, { hasBrand: false });

    const { result } = renderHook(() => useBrandEnabledSkills());

    await act(async () => {
      await result.current.toggleSkill('skill-b');
    });

    expect(updateEnabledSkillsMock).not.toHaveBeenCalled();
    expect(result.current.enabledSlugs).toEqual([]);
  });

  it('does not roll a failed request into a newly selected brand', async () => {
    let rejectRequest: ((reason?: unknown) => void) | undefined;
    updateEnabledSkillsMock.mockReturnValue(
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
      expect(updateEnabledSkillsMock).toHaveBeenCalledTimes(1);
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

  it('reports the default set as enabled while the brand has no selection', async () => {
    setBrand([]);

    const { result } = renderHook(() =>
      useBrandEnabledSkills({ defaultSlugs: ['content-writing'] }),
    );

    await waitFor(() => {
      expect(result.current.enabledSlugs).toEqual(['content-writing']);
    });
    expect(result.current.isUsingDefaults).toBe(true);
  });

  it('starts the first toggle from the default set', async () => {
    setBrand(undefined);

    const { result } = renderHook(() =>
      useBrandEnabledSkills({
        defaultSlugs: ['content-writing', 'model-selector'],
      }),
    );

    await act(async () => {
      await result.current.toggleSkill('content-writing');
    });

    expect(updateEnabledSkillsMock).toHaveBeenCalledWith('brand-1', {
      enabledSkills: ['model-selector'],
      useDefaultSkills: false,
    });
    expect(result.current.enabledSlugs).toEqual(['model-selector']);
    expect(result.current.isUsingDefaults).toBe(false);
  });

  it('keeps an explicit empty selection empty when defaults are off', async () => {
    setBrand([], { useDefaultSkills: false });

    const { result } = renderHook(() =>
      useBrandEnabledSkills({ defaultSlugs: ['content-writing'] }),
    );

    await waitFor(() => {
      expect(result.current.isUsingDefaults).toBe(false);
    });
    expect(result.current.enabledSlugs).toEqual([]);
  });

  it('switches defaults on and off through setUseDefaults', async () => {
    setBrand(['skill-a'], { useDefaultSkills: false });

    const { result } = renderHook(() =>
      useBrandEnabledSkills({ defaultSlugs: ['content-writing'] }),
    );

    await waitFor(() => {
      expect(result.current.enabledSlugs).toEqual(['skill-a']);
    });

    await act(async () => {
      await result.current.setUseDefaults(true);
    });

    expect(updateEnabledSkillsMock).toHaveBeenLastCalledWith('brand-1', {
      enabledSkills: ['skill-a'],
      useDefaultSkills: true,
    });
    expect(result.current.isUsingDefaults).toBe(true);
    expect(result.current.enabledSlugs).toEqual(['content-writing']);

    await act(async () => {
      await result.current.setUseDefaults(false);
    });

    expect(updateEnabledSkillsMock).toHaveBeenLastCalledWith('brand-1', {
      enabledSkills: ['skill-a'],
      useDefaultSkills: false,
    });
    expect(result.current.enabledSlugs).toEqual(['skill-a']);
  });

  it('seeds the explicit list with the defaults when leaving default mode without one', async () => {
    setBrand([], { useDefaultSkills: true });

    const { result } = renderHook(() =>
      useBrandEnabledSkills({ defaultSlugs: ['content-writing'] }),
    );

    await waitFor(() => {
      expect(result.current.isUsingDefaults).toBe(true);
    });

    await act(async () => {
      await result.current.setUseDefaults(false);
    });

    expect(updateEnabledSkillsMock).toHaveBeenLastCalledWith('brand-1', {
      enabledSkills: ['content-writing'],
      useDefaultSkills: false,
    });
    expect(result.current.enabledSlugs).toEqual(['content-writing']);
  });
});
