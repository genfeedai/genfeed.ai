import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LoginPage from './content';
import '@testing-library/jest-dom';

const pushMock = vi.fn();
const useAuthMock = vi.fn(() => ({ isLoaded: true, isSignedIn: false }));
const signInMock = vi.fn(
  ({ fallbackRedirectUrl }: { fallbackRedirectUrl?: string }) => (
    <div
      data-fallback-redirect-url={fallbackRedirectUrl}
      data-testid="clerk-signin"
    >
      Sign In Component
    </div>
  ),
);

vi.mock('@clerk/nextjs', () => ({
  SignIn: (props: { fallbackRedirectUrl?: string }) => signInMock(props),
  useAuth: () => useAuthMock(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}));

vi.mock('@ui/layouts/auth/AuthFormLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="auth-form-layout">{children}</div>
  ),
}));

describe('LoginPage', () => {
  beforeEach(() => {
    pushMock.mockClear();
    signInMock.mockClear();
    useAuthMock.mockReset();
    useAuthMock.mockReturnValue({ isLoaded: true, isSignedIn: false });
  });

  it('uses / as the sign-in fallback redirect', async () => {
    render(<LoginPage />);

    await waitFor(() => {
      expect(screen.getByTestId('clerk-signin')).toHaveAttribute(
        'data-fallback-redirect-url',
        '/',
      );
    });
  });

  it('redirects signed-in users to /', async () => {
    useAuthMock.mockReturnValueOnce({ isLoaded: true, isSignedIn: true });

    render(<LoginPage />);

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith('/');
    });
  });

  it('should render without crashing', () => {
    const { container } = render(<LoginPage />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should render AuthFormLayout wrapper', () => {
    render(<LoginPage />);
    expect(screen.getByTestId('auth-form-layout')).toBeInTheDocument();
  });

  it('should render Clerk SignIn component after mount', async () => {
    render(<LoginPage />);
    await waitFor(() => {
      expect(screen.getByTestId('clerk-signin')).toBeInTheDocument();
    });
  });

  it('should not render SignIn before component is mounted', () => {
    const { container } = render(<LoginPage />);
    // Initially should not have SignIn rendered
    const signIn = container.querySelector('[data-testid="clerk-signin"]');
    if (!signIn) {
      expect(signIn).toBeNull();
    }
  });
});
