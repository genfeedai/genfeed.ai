import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthScreen } from './AuthScreen';

const login = vi.fn(async () => {});
const enableOfflineMode = vi.fn(async () => {});

describe('AuthScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    login.mockResolvedValue(undefined);
    enableOfflineMode.mockResolvedValue(undefined);
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

  it('exposes browser PKCE and the desktop-only account-less path', () => {
    render(<AuthScreen />);

    expect(
      screen.getByRole('button', { name: 'Sign in with Genfeed Cloud' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Continue without an account' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByText(/password/i)).not.toBeInTheDocument();
  });

  it('starts browser login from the cloud action', async () => {
    render(<AuthScreen />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Sign in with Genfeed Cloud' }),
    );
    await waitFor(() => expect(login).toHaveBeenCalledTimes(1));
    expect(enableOfflineMode).not.toHaveBeenCalled();
  });

  it('opens the local workspace from the account-less action', async () => {
    render(<AuthScreen />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Continue without an account' }),
    );
    await waitFor(() => expect(enableOfflineMode).toHaveBeenCalledTimes(1));
    expect(login).not.toHaveBeenCalled();
  });

  it('prevents a second action while the first action is pending', async () => {
    let resolveLogin: (() => void) | undefined;
    login.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveLogin = resolve;
        }),
    );
    render(<AuthScreen />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Sign in with Genfeed Cloud' }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Continue without an account' }),
    );

    expect(login).toHaveBeenCalledTimes(1);
    expect(enableOfflineMode).not.toHaveBeenCalled();
    resolveLogin?.();
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Sign in with Genfeed Cloud' }),
      ).toBeEnabled(),
    );
  });
});
