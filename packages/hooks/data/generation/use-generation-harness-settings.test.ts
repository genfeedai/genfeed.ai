import { createQueryWrapper } from '@hooks/tests/query-wrapper';
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

  it('does not fetch until opened', async () => {
    const { result, rerender } = renderHook(
      ({ open }) => useGenerationHarnessSettings(open),
      { initialProps: { open: false }, wrapper: createQueryWrapper() },
    );
    expect(mocks.service.getSettings).not.toHaveBeenCalled();
    rerender({ open: true });
    await waitFor(() => expect(result.current.settings).toEqual(enabled));
  });

  it('shows cached settings at once when the popover reopens', async () => {
    const wrapper = createQueryWrapper();
    const first = renderHook(() => useGenerationHarnessSettings(true), {
      wrapper,
    });
    await waitFor(() => expect(first.result.current.settings).toEqual(enabled));
    expect(first.result.current.isLoading).toBe(false);
    first.unmount();

    const second = renderHook(() => useGenerationHarnessSettings(true), {
      wrapper,
    });
    expect(second.result.current.settings).toEqual(enabled);
    expect(second.result.current.isLoading).toBe(false);
    expect(mocks.service.getSettings).toHaveBeenCalledTimes(1);
  });

  it('persists false and reset as distinct values and rereads effective preferences', async () => {
    const { result } = renderHook(() => useGenerationHarnessSettings(true), {
      wrapper: createQueryWrapper(),
    });
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
    expect(mocks.service.updateSettings).toHaveBeenCalledWith({
      scope: 'brand',
      brandId: 'brand-1',
      isEnabled: false,
    });
    expect(result.current.settings?.isEnabled).toBe(false);
    mocks.service.getSettings.mockResolvedValue(enabled);
    await act(async () => {
      await result.current.save('brand', null);
    });
    expect(mocks.service.updateSettings).toHaveBeenLastCalledWith({
      scope: 'brand',
      brandId: 'brand-1',
      isEnabled: null,
    });
    expect(result.current.settings?.source).toBe('organization');
  });

  it('does not show a failed save as successful', async () => {
    const { result } = renderHook(() => useGenerationHarnessSettings(true), {
      wrapper: createQueryWrapper(),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    mocks.service.updateSettings.mockRejectedValue(new Error('Offline'));
    await act(async () => {
      await result.current.save('brand', false);
    });
    expect(result.current.settings).toEqual(enabled);
    expect(result.current.error).toContain('Could not confirm');
    expect(result.current.isSaving).toBe(false);
  });

  it('keeps each brand cached separately when switching brands', async () => {
    const wrapper = createQueryWrapper();
    const { result, rerender } = renderHook(
      () => useGenerationHarnessSettings(true),
      { wrapper },
    );
    await waitFor(() => expect(result.current.settings).toEqual(enabled));
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
    mocks.brand = { brandId: 'brand-1', organizationId: 'org-1' };
    rerender();
    expect(result.current.settings).toEqual(enabled);
    expect(mocks.service.getSettings).toHaveBeenCalledTimes(2);
  });

  it('reports a load failure and recovers on refresh', async () => {
    mocks.service.getSettings.mockRejectedValueOnce(new Error('Offline'));
    const { result } = renderHook(() => useGenerationHarnessSettings(true), {
      wrapper: createQueryWrapper(),
    });
    await waitFor(() =>
      expect(result.current.error).toBe(
        'Could not load prompt enhancement settings.',
      ),
    );
    act(() => result.current.refresh());
    await waitFor(() => expect(result.current.settings).toEqual(enabled));
    expect(result.current.error).toBeNull();
  });
});
