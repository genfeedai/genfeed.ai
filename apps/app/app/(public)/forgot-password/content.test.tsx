import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ForgotPasswordContent from './content';

const authClientMocks = vi.hoisted(() => ({
  requestPasswordReset: vi.fn(),
}));

vi.mock('@genfeedai/auth-client', () => ({
  requestPasswordReset: authClientMocks.requestPasswordReset,
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

vi.mock('@ui/layouts/auth/AuthFormLayout', () => ({
  default: ({
    children,
    description,
    logoSize,
    title,
  }: {
    children: React.ReactNode;
    description?: React.ReactNode;
    logoSize?: string;
    title?: string;
  }) => (
    <div data-logo-size={logoSize} data-testid="auth-form-layout">
      {title ? (
        <>
          <h1>{title}</h1>
          <p>{description}</p>
        </>
      ) : null}
      {children}
    </div>
  ),
}));

const getEmailInput = () => screen.getByRole('textbox', { name: /^Email/ });

describe('ForgotPasswordContent', () => {
  beforeEach(() => {
    authClientMocks.requestPasswordReset.mockReset();
    authClientMocks.requestPasswordReset.mockResolvedValue({});
    window.history.replaceState({}, '', '/forgot-password');
  });

  it('renders the reset request form', () => {
    render(<ForgotPasswordContent />);

    expect(screen.getByTestId('auth-form-layout')).toHaveAttribute(
      'data-logo-size',
      'compact',
    );
    expect(
      screen.getByRole('heading', { name: 'Reset your password' }),
    ).toBeInTheDocument();
    expect(getEmailInput()).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send link' })).toBeDisabled();
    expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute(
      'href',
      '/login/password',
    );
  });

  it('requests a password reset with an absolute reset redirect', async () => {
    window.history.replaceState(
      {},
      '',
      '/forgot-password?callbackUrl=%2Foauth%2Fcli%3Fport%3D4321',
    );

    render(<ForgotPasswordContent />);

    fireEvent.change(getEmailInput(), {
      target: { value: 'user@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send link' }));

    await waitFor(() => {
      expect(authClientMocks.requestPasswordReset).toHaveBeenCalledWith({
        email: 'user@example.com',
        redirectTo: `${window.location.origin}/reset-password?callbackUrl=%2Foauth%2Fcli%3Fport%3D4321`,
      });
    });
    expect(screen.getByText('Check your email')).toBeInTheDocument();
  });

  it('shows request errors without leaving the form', async () => {
    authClientMocks.requestPasswordReset.mockResolvedValue({
      error: { message: 'Too many reset attempts.' },
    });

    render(<ForgotPasswordContent />);

    fireEvent.change(getEmailInput(), {
      target: { value: 'user@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send link' }));

    expect(await screen.findByText('Too many reset attempts.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Send link' })).toBeEnabled();
  });
});
