import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const service = { getSettings: vi.fn(), updateSettings: vi.fn() };
  return {
    brand: { brandId: 'brand-1', organizationId: 'org-1' },
    service,
    getService: async () => service,
  };
});
vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => mocks.brand,
}));
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => mocks.getService,
}));
vi.mock('@services/ai/generation-harness.service', () => ({
  GenerationHarnessService: { getInstance: vi.fn() },
}));

import { useGenerationHarnessSettings } from './use-generation-harness-settings';

const enabled = {
  organizationEnabled: true,
  brandEnabled: null,
  brandId: 'brand-1',
  isEnabled: true,
  source: 'organization',
};

describe('useGenerationHarnessSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.brand = { brandId: 'brand-1', organizationId: 'org-1' };
    mocks.service.getSettings.mockResolvedValue(enabled);
    mocks.service.updateSettings.mockResolvedValue(enabled);
  });

  it('does not fetch until opened and reloads after reopening', async () => {
    const { result, rerender } = renderHook(
      ({ open }) => useGenerationHarnessSettings(open),
      { initialProps: { open: false } },
    );
    expect(mocks.service.getSettings).not.toHaveBeenCalled();
    rerender({ open: true });
    await waitFor(() => expect(result.current.settings).toEqual(enabled));
    rerender({ open: false });
    mocks.service.getSettings.mockResolvedValue({
      ...enabled,
      isEnabled: false,
      organizationEnabled: false,
    });
    rerender({ open: true });
    await waitFor(() => expect(result.current.settings?.isEnabled).toBe(false));
  });

  it('persists false and reset as distinct values and rereads effective preferences', async () => {
    const { result } = renderHook(() => useGenerationHarnessSettings(true));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    mocks.service.getSettings.mockResolvedValue({
      ...enabled,
      brandEnabled: false,
      isEnabled: false,
      source: 'brand',
    });
    await act(async () => {
      await result.current.save('brand', false);
    });
    expect(mocks.service.updateSettings).toHaveBeenCalledWith(
      { scope: 'brand', brandId: 'brand-1', isEnabled: false },
      expect.any(AbortSignal),
    );
    expect(result.current.settings?.isEnabled).toBe(false);
    mocks.service.getSettings.mockResolvedValue(enabled);
    await act(async () => {
      await result.current.save('brand', null);
    });
    expect(mocks.service.updateSettings).toHaveBeenLastCalledWith(
      { scope: 'brand', brandId: 'brand-1', isEnabled: null },
      expect.any(AbortSignal),
    );
    expect(result.current.settings?.source).toBe('organization');
  });

  it('does not show a failed save as successful', async () => {
    const { result } = renderHook(() => useGenerationHarnessSettings(true));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    mocks.service.updateSettings.mockRejectedValue(new Error('Offline'));
    await act(async () => {
      await result.current.save('brand', false);
    });
    expect(result.current.settings).toEqual(enabled);
    expect(result.current.error).toContain('Could not confirm');
    expect(result.current.isSaving).toBe(false);
  });

  it('ignores an old brand response after brand switching', async () => {
    let finishOld: (value: typeof enabled) => void = () => {};
    mocks.service.getSettings.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishOld = resolve;
        }),
    );
    const { result, rerender } = renderHook(() =>
      useGenerationHarnessSettings(true),
    );
    await waitFor(() =>
      expect(mocks.service.getSettings).toHaveBeenCalledTimes(1),
    );
    const oldSignal = mocks.service.getSettings.mock.calls[0][1] as AbortSignal;
    mocks.brand = { brandId: 'brand-2', organizationId: 'org-1' };
    mocks.service.getSettings.mockResolvedValue({
      ...enabled,
      brandId: 'brand-2',
      isEnabled: false,
    });
    rerender();
    await waitFor(() =>
      expect(result.current.settings?.brandId).toBe('brand-2'),
    );
    await act(async () => {
      finishOld(enabled);
    });
    expect(oldSignal.aborted).toBe(true);
    expect(result.current.settings?.brandId).toBe('brand-2');
  });

  it('refreshes external agent changes when the window regains focus', async () => {
    const { result } = renderHook(() => useGenerationHarnessSettings(true));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    mocks.service.getSettings.mockResolvedValue({
      ...enabled,
      organizationEnabled: false,
      isEnabled: false,
    });
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    await waitFor(() => expect(result.current.settings?.isEnabled).toBe(false));
  });
  it('keeps loaded controls visible while checking for external changes', async () => {
    const { result } = renderHook(() => useGenerationHarnessSettings(true));
    await waitFor(() => expect(result.current.settings).toEqual(enabled));
    let finishRefresh: (value: typeof enabled) => void = () => {};
    mocks.service.getSettings.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishRefresh = resolve;
        }),
    );
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    await waitFor(() =>
      expect(mocks.service.getSettings).toHaveBeenCalledTimes(2),
    );
    expect(result.current.settings).toEqual(enabled);
    expect(result.current.isLoading).toBe(false);
    await act(async () => {
      finishRefresh({ ...enabled, isEnabled: false });
    });
    expect(result.current.settings?.isEnabled).toBe(false);
  });
});
