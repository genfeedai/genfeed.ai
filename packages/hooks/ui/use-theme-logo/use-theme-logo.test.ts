import { useThemeLogo } from '@hooks/ui/use-theme-logo/use-theme-logo';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies
let mockIsMounted = true;

vi.mock('@hooks/utils/use-mounted/use-mounted', () => ({
  useMounted: vi.fn(() => mockIsMounted),
}));

vi.mock('@genfeedai/services/core/environment.service', () => ({
  EnvironmentService: {
    logoURL: 'https://example.com/logo.svg',
  },
}));

describe('useThemeLogo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsMounted = true;
  });

  describe('Initial State', () => {
    it('returns a string', () => {
      const { result } = renderHook(() => useThemeLogo());

      expect(typeof result.current).toBe('string');
    });

    it('returns empty string when not mounted', () => {
      mockIsMounted = false;

      const { result } = renderHook(() => useThemeLogo());

      expect(result.current).toBe('');
    });
  });

  describe('Mounted State', () => {
    it('returns logo URL when mounted', async () => {
      mockIsMounted = true;

      const { result } = renderHook(() => useThemeLogo());

      await waitFor(() => {
        expect(result.current).toBe('https://example.com/logo.svg');
      });
    });
  });

  describe('Return Value Type', () => {
    it('always returns a string', async () => {
      const { result } = renderHook(() => useThemeLogo());

      await waitFor(() => {
        expect(typeof result.current).toBe('string');
      });
    });

    it('returns valid URL when mounted', async () => {
      mockIsMounted = true;

      const { result } = renderHook(() => useThemeLogo());

      await waitFor(() => {
        expect(result.current).toMatch(/^https?:\/\/.+/);
      });
    });
  });
});
