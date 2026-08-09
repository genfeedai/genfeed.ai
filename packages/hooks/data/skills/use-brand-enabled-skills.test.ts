import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockUseBrand = vi.fn();
const mockResolveAuthToken = vi.fn();

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
  options: { isReady?: boolean; hasBrand?: boolean } = {},
): void {
  const { hasBrand = true, isReady = true } = options;
  mockUseBrand.mockReturnValue({
    isReady,
    selectedBrand: hasBrand
      ? { agentConfig: { enabledSkills }, id: 'brand-1' }
      : null,
  });
}

describe('useBrandEnabledSkills', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValue({ ok: true });
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

  it('ignores toggles without a selected brand', async () => {
    setBrand(undefined, { hasBrand: false });

    const { result } = renderHook(() => useBrandEnabledSkills());

    await act(async () => {
      await result.current.toggleSkill('skill-b');
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.enabledSlugs).toEqual([]);
  });
});
