import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LoginPage from './content';
import LoginBetterAuth from './login-better-auth';

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

const getEmailInput = () => screen.getByRole('textbox', { name: /^Email/ });
const absoluteCallback = (path: string) => `${window.location.origin}${path}`;

describe('LoginPage', () => {
  beforeEach(() => {
    authClientMocks.email.mockReset();
    authClientMocks.email.mockResolvedValue({});
    authClientMocks.magicLink.mockReset();
    authClientMocks.magicLink.mockResolvedValue({});
    authClientMocks.social.mockReset();
    authClientMocks.social.mockResolvedValue({});
    window.history.replaceState({}, '', '/login');
  });

  it('renders the Better Auth sign-in chooser', () => {
    render(<LoginPage />);

    expect(screen.getByTestId('auth-form-layout')).toBeInTheDocument();
    expect(screen.getByTestId('auth-form-layout')).toHaveAttribute(
      'data-logo-size',
      'compact',
    );
    expect(
      screen.getByRole('heading', { name: 'Welcome Back' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /^Email/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Google' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Magic Link' })).toHaveAttribute(
      'href',
      '/login/magic-link',
    );
    expect(
      screen.getByRole('link', {
        name: 'Email / Password',
      }),
    ).toHaveAttribute('href', '/login/password');
  });

  it('preserves callbackUrl across chooser links', () => {
    window.history.replaceState(
      {},
      '',
      '/login?callbackUrl=%2Foauth%2Fcli%3Fport%3D4321',
    );

    render(<LoginPage />);

    expect(screen.getByRole('link', { name: 'Magic Link' })).toHaveAttribute(
      'href',
      '/login/magic-link?callbackUrl=%2Foauth%2Fcli%3Fport%3D4321',
    );
    expect(
      screen.getByRole('link', {
        name: 'Email / Password',
      }),
    ).toHaveAttribute(
      'href',
      '/login/password?callbackUrl=%2Foauth%2Fcli%3Fport%3D4321',
    );
  });

  it('starts Google sign-in with the default callback URL', async () => {
    render(<LoginPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Google' }));

    await waitFor(() => {
      expect(authClientMocks.social).toHaveBeenCalledWith({
        callbackURL: absoluteCallback('/'),
        provider: 'google',
      });
    });
  });

  it('preserves callbackUrl when starting Google sign-in', async () => {
    window.history.replaceState({}, '', '/login?return_to=%2Fonboarding');

    render(<LoginPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Google' }));

    await waitFor(() => {
      expect(authClientMocks.social).toHaveBeenCalledWith({
        callbackURL: absoluteCallback('/onboarding'),
        provider: 'google',
      });
    });
  });

  it('renders the magic-link page form', () => {
    render(<LoginBetterAuth mode="magic-link" />);

    expect(
      screen.getByRole('heading', { name: 'Sign in with a magic link' }),
    ).toBeInTheDocument();
    expect(getEmailInput()).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Email me a sign-in link' }),
    ).toBeDisabled();
  });

  it('sends a magic-link sign-in with the default callback URL', async () => {
    render(<LoginBetterAuth mode="magic-link" />);

    fireEvent.change(getEmailInput(), {
      target: { value: 'user@example.com' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Email me a sign-in link' }),
    );

    await waitFor(() => {
      expect(authClientMocks.magicLink).toHaveBeenCalledWith({
        callbackURL: absoluteCallback('/'),
        email: 'user@example.com',
      });
    });
    expect(screen.getByText('Check your email')).toBeInTheDocument();
  });

  it('preserves callbackUrl when requesting a magic link', async () => {
    window.history.replaceState(
      {},
      '',
      '/login/magic-link?callbackUrl=%2Foauth%2Fcli%3Fport%3D4321',
    );

    render(<LoginBetterAuth mode="magic-link" />);

    fireEvent.change(getEmailInput(), {
      target: { value: 'cli@example.com' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Email me a sign-in link' }),
    );

    await waitFor(() => {
      expect(authClientMocks.magicLink).toHaveBeenCalledWith({
        callbackURL: absoluteCallback('/oauth/cli?port=4321'),
        email: 'cli@example.com',
      });
    });
  });

  it('submits the email password page form', async () => {
    render(<LoginBetterAuth mode="password" />);

    fireEvent.change(getEmailInput(), {
      target: { value: 'saved@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/^Password/), {
      target: { value: 'correct horse battery staple' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(authClientMocks.email).toHaveBeenCalledWith({
        callbackURL: absoluteCallback('/'),
        email: 'saved@example.com',
        password: 'correct horse battery staple',
      });
    });
  });
});
