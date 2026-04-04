import { useOrganization } from '@hooks/data/organization/use-organization/use-organization';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies
const mockRefreshSettings = vi.fn();
const mockPatchSettings = vi.fn();

vi.mock('@contexts/user/brand-context/brand-context', () => ({
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

vi.mock('@services/core/logger.service', () => ({
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

  describe('Initial State', () => {
    it('returns settings from brand context', () => {
      const { result } = renderHook(() => useOrganization());

      expect(result.current.settings).toEqual({
        autoPublish: true,
        creditsLimit: 1000,
        defaultModel: 'model-1',
      });
    });

    it('returns isLoading from brand context', () => {
      const { result } = renderHook(() => useOrganization());

      expect(result.current.isLoading).toBe(false);
    });

    it('returns null error by default', () => {
      const { result } = renderHook(() => useOrganization());

      expect(result.current.error).toBeNull();
    });

    it('returns refresh function from brand context', () => {
      const { result } = renderHook(() => useOrganization());

      expect(result.current.refresh).toBe(mockRefreshSettings);
    });
  });

  describe('updateSettings', () => {
    it('calls patchSettings with correct parameters', async () => {
      const { result } = renderHook(() => useOrganization());

      await act(async () => {
        await result.current.updateSettings('autoPublish', false);
      });

      expect(mockPatchSettings).toHaveBeenCalledWith('org-123', {
        autoPublish: false,
      });
    });

    it('refreshes settings after successful update', async () => {
      const { result } = renderHook(() => useOrganization());

      await act(async () => {
        await result.current.updateSettings('defaultModel', 'model-2');
      });

      expect(mockRefreshSettings).toHaveBeenCalled();
    });

    it('updates string settings', async () => {
      const { result } = renderHook(() => useOrganization());

      await act(async () => {
        await result.current.updateSettings('defaultModel', 'new-model');
      });

      expect(mockPatchSettings).toHaveBeenCalledWith('org-123', {
        defaultModel: 'new-model',
      });
    });

    it('updates number settings', async () => {
      const { result } = renderHook(() => useOrganization());

      await act(async () => {
        await result.current.updateSettings('creditsLimit', 2000);
      });

      expect(mockPatchSettings).toHaveBeenCalledWith('org-123', {
        creditsLimit: 2000,
      });
    });

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

    it('does not refresh settings when update fails', async () => {
      mockPatchSettings.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useOrganization());

      try {
        await result.current.updateSettings('autoPublish', false);
      } catch {
        // Expected to throw
      }

      expect(mockRefreshSettings).not.toHaveBeenCalled();
    });
  });

  describe('Loading State', () => {
    it('reflects loading state from brand context', async () => {
      const { useBrand } = await import(
        '@contexts/user/brand-context/brand-context'
      );
      vi.mocked(useBrand).mockReturnValue({
        organizationId: 'org-123',
        refreshSettings: mockRefreshSettings,
        settings: null,
        settingsLoading: true,
      } as ReturnType<typeof useBrand>);

      const { result } = renderHook(() => useOrganization());

      expect(result.current.isLoading).toBe(true);
    });
  });

  describe('Missing Organization', () => {
    it('throws error when organizationId is missing', async () => {
      const { useBrand } = await import(
        '@contexts/user/brand-context/brand-context'
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

    it('updateSettings is a function', () => {
      const { result } = renderHook(() => useOrganization());

      expect(typeof result.current.updateSettings).toBe('function');
    });

    it('refresh is a function', () => {
      const { result } = renderHook(() => useOrganization());

      expect(typeof result.current.refresh).toBe('function');
    });
  });
});
