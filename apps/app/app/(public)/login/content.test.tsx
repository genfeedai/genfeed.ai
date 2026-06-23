import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LoginPage from './content';

const authClientMocks = vi.hoisted(() => ({
  email: vi.fn(),
  magicLink: vi.fn(),
  social: vi.fn(),
}));

vi.mock('@genfeedai/auth-client', () => ({
  signIn: {
    email: authClientMocks.email,
    magicLink: authClientMocks.magicLink,
    social: authClientMocks.social,
  },
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

vi.mock('@ui/layouts/auth/AuthFormLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="auth-form-layout">{children}</div>
  ),
}));

const getEmailInput = () => screen.getByRole('textbox', { name: /^Email/ });

describe('LoginPage', () => {
  beforeEach(() => {
    authClientMocks.email.mockReset();
    authClientMocks.email.mockResolvedValue({});
    authClientMocks.magicLink.mockReset();
    authClientMocks.magicLink.mockResolvedValue({});
    authClientMocks.social.mockReset();
    window.history.replaceState({}, '', '/login');
  });

  it('renders the Better Auth magic-link form', () => {
    render(<LoginPage />);

    expect(screen.getByTestId('auth-form-layout')).toBeInTheDocument();
    expect(getEmailInput()).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Email me a sign-in link' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Continue with Google' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Use email and password' }),
    ).toBeInTheDocument();
  });

  it('sends a magic-link sign-in with the default callback URL', async () => {
    render(<LoginPage />);

    fireEvent.change(getEmailInput(), {
      target: { value: 'user@example.com' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Email me a sign-in link' }),
    );

    await waitFor(() => {
      expect(authClientMocks.magicLink).toHaveBeenCalledWith({
        callbackURL: '/',
        email: 'user@example.com',
      });
    });
    expect(screen.getByText('Check your email')).toBeInTheDocument();
  });

  it('preserves callbackUrl when requesting a magic link', async () => {
    window.history.replaceState(
      {},
      '',
      '/login?callbackUrl=%2Foauth%2Fcli%3Fport%3D4321',
    );

    render(<LoginPage />);

    fireEvent.change(getEmailInput(), {
      target: { value: 'cli@example.com' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Email me a sign-in link' }),
    );

    await waitFor(() => {
      expect(authClientMocks.magicLink).toHaveBeenCalledWith({
        callbackURL: '/oauth/cli?port=4321',
        email: 'cli@example.com',
      });
    });
  });

  it('shows and submits the email password fallback', async () => {
    render(<LoginPage />);

    fireEvent.change(getEmailInput(), {
      target: { value: 'saved@example.com' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Use email and password' }),
    );
    fireEvent.change(screen.getByLabelText(/^Password/), {
      target: { value: 'correct horse battery staple' },
    });
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Sign in with email and password',
      }),
    );

    await waitFor(() => {
      expect(authClientMocks.email).toHaveBeenCalledWith({
        callbackURL: '/',
        email: 'saved@example.com',
        password: 'correct horse battery staple',
      });
    });
  });
});
