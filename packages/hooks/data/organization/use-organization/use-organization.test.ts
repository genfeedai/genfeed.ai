import { useOrganization } from '@hooks/data/organization/use-organization/use-organization';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies
const mockRefreshSettings = vi.fn();
const mockPatchSettings = vi.fn();

vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: vi.fn(() => ({
    organizationId: 'org-123',
    refreshSettings: mockRefreshSettings,
    settings: {
      autoPublish: true,
      creditsLimit: 1000,
      defaultModel: 'model-1',
    },
    settingsLoading: false,
  })),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: vi.fn((_factory) => {
    return vi.fn().mockResolvedValue({
      patchSettings: mockPatchSettings,
    });
  }),
}));

vi.mock('@genfeedai/services/core/logger.service', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

describe('useOrganization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRefreshSettings.mockResolvedValue(undefined);
    mockPatchSettings.mockResolvedValue(undefined);
  });

  describe('updateSettings', () => {
    it('updates boolean settings', async () => {
      const { result } = renderHook(() => useOrganization());

      await act(async () => {
        await result.current.updateSettings('autoPublish', true);
      });

      expect(mockPatchSettings).toHaveBeenCalledWith('org-123', {
        autoPublish: true,
      });
    });

    it('throws error when patchSettings fails', async () => {
      mockPatchSettings.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useOrganization());

      await expect(
        result.current.updateSettings('autoPublish', false),
      ).rejects.toThrow('Network error');
    });
  });

  describe('Missing Organization', () => {
    it('throws error when organizationId is missing', async () => {
      const { useBrand } = await import(
        '@genfeedai/contexts/user/brand-context/brand-context'
      );
      vi.mocked(useBrand).mockReturnValue({
        organizationId: null,
        refreshSettings: mockRefreshSettings,
        settings: {},
        settingsLoading: false,
      } as ReturnType<typeof useBrand>);

      const { result } = renderHook(() => useOrganization());

      await expect(
        result.current.updateSettings('autoPublish', false),
      ).rejects.toThrow('Organization ID is required');
    });
  });

  describe('All Return Values', () => {
    it('returns all expected properties', () => {
      const { result } = renderHook(() => useOrganization());

      expect(result.current).toHaveProperty('settings');
      expect(result.current).toHaveProperty('isLoading');
      expect(result.current).toHaveProperty('error');
      expect(result.current).toHaveProperty('updateSettings');
      expect(result.current).toHaveProperty('refresh');
    });
  });
});
