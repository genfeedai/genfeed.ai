import { useThemeLogo } from '@hooks/ui/use-theme-logo/use-theme-logo';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const CDN_LOGO_URL = 'https://cdn.genfeed.ai/assets/branding/logo.svg';
const DESKTOP_LOGO_URL = '/logo.svg';
const originalDesktopShell = process.env.NEXT_PUBLIC_DESKTOP_SHELL;

describe('useThemeLogo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

    // The logo is first paint on the auth screens, so it must never render as
    // an empty src while waiting for hydration.
    it('resolves a logo URL on the very first render', () => {
      const { result } = renderHook(() => useThemeLogo());

      expect(result.current).toBe(CDN_LOGO_URL);
    });
  });

  describe('Client surface', () => {
    it('returns the CDN logo URL on a web surface', async () => {
      const { result } = renderHook(() => useThemeLogo());

      await waitFor(() => {
        expect(result.current).toBe(CDN_LOGO_URL);
      });
    });

    it('returns the bundled local asset in desktop shell mode', async () => {
      process.env.NEXT_PUBLIC_DESKTOP_SHELL = '1';

      const { result } = renderHook(() => useThemeLogo());

      await waitFor(() => {
        expect(result.current).toBe(DESKTOP_LOGO_URL);
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
  });
});
