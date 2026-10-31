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

import Login from '@/app/(public)/login';

describe('mobile login appearance access', () => {
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

  it('lets signed-out users choose an accessible local appearance preference', async () => {
    render(<Login />);

    expect(
      screen.getByRole('radio', { name: 'System appearance' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('radio', { name: 'Light appearance' }),
    ).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Dark appearance' })).toBeTruthy();

    fireEvent.click(screen.getByRole('radio', { name: 'Light appearance' }));

    await waitFor(() => {
      expect(setPreferenceMock).toHaveBeenCalledWith('light');
    });
  });
});
