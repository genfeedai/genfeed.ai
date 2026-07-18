import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthScreen } from './AuthScreen';

const login = vi.fn(async () => {});
const enableOfflineMode = vi.fn(async () => {});

describe('AuthScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.genfeedDesktop = {
      app: {
        enableOfflineMode,
      },
      auth: {
        login,
      },
      notifications: {
        notify: vi.fn(async () => {}),
      },
    } as unknown as typeof window.genfeedDesktop;
  });

  it('uses browser PKCE and exposes the desktop-only account-less path', async () => {
    render(<AuthScreen />);

    expect(
      screen.getByRole('button', { name: 'Sign in with Genfeed Cloud' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Continue without an account' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByText(/password/i)).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Sign in with Genfeed Cloud' }),
    );
    await waitFor(() => expect(login).toHaveBeenCalledTimes(1));

    fireEvent.click(
      screen.getByRole('button', { name: 'Continue without an account' }),
    );
    await waitFor(() => expect(enableOfflineMode).toHaveBeenCalledTimes(1));
  });
});
