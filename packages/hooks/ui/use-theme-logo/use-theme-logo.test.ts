import { useThemeLogo } from '@hooks/ui/use-theme-logo/use-theme-logo';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies
let mockIsMounted = true;
const originalDesktopShell = process.env.NEXT_PUBLIC_DESKTOP_SHELL;

vi.mock('@hooks/utils/use-mounted/use-mounted', () => ({
  useMounted: vi.fn(() => mockIsMounted),
}));

describe('useThemeLogo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsMounted = true;
    if (originalDesktopShell === undefined) {
      delete process.env.NEXT_PUBLIC_DESKTOP_SHELL;
    } else {
      process.env.NEXT_PUBLIC_DESKTOP_SHELL = originalDesktopShell;
    }
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
    it('returns the CDN logo URL when mounted on a web surface', async () => {
      mockIsMounted = true;

      const { result } = renderHook(() => useThemeLogo());

      await waitFor(() => {
        expect(result.current).toBe(
          'https://cdn.genfeed.ai/assets/branding/logo.svg',
        );
      });
    });

    it('returns the bundled local asset in desktop shell mode', async () => {
      process.env.NEXT_PUBLIC_DESKTOP_SHELL = '1';
      mockIsMounted = true;

      const { result } = renderHook(() => useThemeLogo());

      await waitFor(() => {
        expect(result.current).toBe('/genfeed-icon.svg');
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

    it('returns the canonical CDN asset URL when mounted', async () => {
      mockIsMounted = true;

      const { result } = renderHook(() => useThemeLogo());

      await waitFor(() => {
        expect(result.current).toBe(
          'https://cdn.genfeed.ai/assets/branding/logo.svg',
        );
      });
    });
  });
});
