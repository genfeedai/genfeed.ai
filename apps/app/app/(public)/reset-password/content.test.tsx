import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ResetPasswordContent from './content';

const authClientMocks = vi.hoisted(() => ({
  resetPassword: vi.fn(),
}));

vi.mock('@genfeedai/auth-client', () => ({
  resetPassword: authClientMocks.resetPassword,
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

vi.mock('@ui/layouts/auth/AuthFormLayout', () => ({
  default: ({
    children,
    logoSize,
  }: {
    children: React.ReactNode;
    logoSize?: string;
  }) => (
    <div data-logo-size={logoSize} data-testid="auth-form-layout">
      {children}
    </div>
  ),
}));

const fillPasswords = (password: string, confirmation = password) => {
  fireEvent.change(screen.getByLabelText(/^New password/), {
    target: { value: password },
  });
  fireEvent.change(screen.getByLabelText(/^Confirm password/), {
    target: { value: confirmation },
  });
};

describe('ResetPasswordContent', () => {
  beforeEach(() => {
    authClientMocks.resetPassword.mockReset();
    authClientMocks.resetPassword.mockResolvedValue({});
    window.history.replaceState({}, '', '/reset-password?token=reset-token');
  });

  it('shows a recoverable state when the reset token is missing', () => {
    window.history.replaceState({}, '', '/reset-password');

    render(<ResetPasswordContent />);

    expect(
      screen.getByRole('heading', { name: 'Reset link expired' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'This password reset link is missing a token. Request a new link to continue.',
      ),
    ).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Request a new reset link' }),
    ).toHaveAttribute('href', '/forgot-password');
  });

  it('shows a recoverable state when Better Auth redirects with an invalid token error', () => {
    window.history.replaceState(
      {},
      '',
      '/reset-password?error=INVALID_TOKEN&callbackUrl=%2Foauth%2Fcli%3Fport%3D4321',
    );

    render(<ResetPasswordContent />);

    expect(
      screen.getByText(
        'This password reset link is invalid or expired. Request a new link to continue.',
      ),
    ).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Request a new reset link' }),
    ).toHaveAttribute(
      'href',
      '/forgot-password?callbackUrl=%2Foauth%2Fcli%3Fport%3D4321',
    );
  });

  it('blocks mismatched passwords before calling Better Auth', async () => {
    render(<ResetPasswordContent />);

    fillPasswords('correct horse battery staple', 'different horse');
    fireEvent.click(screen.getByRole('button', { name: 'Reset password' }));

    expect(await screen.findByText('Passwords do not match.')).toBeVisible();
    expect(authClientMocks.resetPassword).not.toHaveBeenCalled();
  });

  it('resets the password with the token and shows a sign-in recovery link', async () => {
    window.history.replaceState(
      {},
      '',
      '/reset-password?token=reset-token&callbackUrl=%2Foauth%2Fcli%3Fport%3D4321',
    );

    render(<ResetPasswordContent />);

    fillPasswords('correct horse battery staple');
    fireEvent.click(screen.getByRole('button', { name: 'Reset password' }));

    await waitFor(() => {
      expect(authClientMocks.resetPassword).toHaveBeenCalledWith({
        newPassword: 'correct horse battery staple',
        token: 'reset-token',
      });
    });
    expect(
      screen.getByRole('heading', { name: 'Password updated' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/login/password?callbackUrl=%2Foauth%2Fcli%3Fport%3D4321',
    );
  });

  it('shows a recoverable error when Better Auth rejects the reset', async () => {
    authClientMocks.resetPassword.mockResolvedValue({
      error: { message: 'Reset token expired.' },
    });

    render(<ResetPasswordContent />);

    fillPasswords('correct horse battery staple');
    fireEvent.click(screen.getByRole('button', { name: 'Reset password' }));

    expect(await screen.findByText('Reset token expired.')).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Request a new reset link' }),
    ).toHaveAttribute('href', '/forgot-password');
  });
});
