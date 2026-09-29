import { useThemeLogo } from '@hooks/ui/use-theme-logo/use-theme-logo';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

  describe('Client surface', () => {
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
