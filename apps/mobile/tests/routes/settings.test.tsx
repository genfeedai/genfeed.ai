import { nativeThemeColors } from '@genfeedai/ui/semantic/mobile';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { setPreferenceMock, useMobileThemeMock } = vi.hoisted(() => ({
  setPreferenceMock: vi.fn(),
  useMobileThemeMock: vi.fn(),
}));

vi.mock('@/contexts/theme-context', () => ({
  useMobileTheme: useMobileThemeMock,
}));

import Settings from '@/app/(protected)/settings';

describe('mobile Settings', () => {
  beforeEach(() => {
    setPreferenceMock.mockReset();
    setPreferenceMock.mockResolvedValue(undefined);
    useMobileThemeMock.mockReturnValue({
      colors: nativeThemeColors.dark,
      preference: 'system',
      resolvedTheme: 'dark',
      setPreference: setPreferenceMock,
    });
  });

  it('offers accessible System, Light, and Dark appearance controls', () => {
    render(<Settings />);

    expect(
      screen
        .getByRole('radio', { name: 'System appearance' })
        .getAttribute('aria-checked'),
    ).toBe('true');
    expect(
      screen.getByRole('radio', { name: 'Light appearance' }),
    ).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Dark appearance' })).toBeTruthy();
  });

  it('applies the selected preference', async () => {
    render(<Settings />);

    fireEvent.click(screen.getByRole('radio', { name: 'Light appearance' }));

    await waitFor(() => {
      expect(setPreferenceMock).toHaveBeenCalledWith('light');
    });
  });
});
