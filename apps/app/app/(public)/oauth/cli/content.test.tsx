// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { act, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CliAuthPage from './page';

const useAuthMock = vi.fn();
const useUserMock = vi.fn();
const useSearchParamsMock = vi.fn();
const resolveClerkTokenMock = vi.fn();
const redirectToCallbackMock = vi.fn();
const signInMock = vi.fn(() => <div data-testid="clerk-signin">Sign In</div>);

vi.mock('@clerk/nextjs', () => ({
  SignIn: (props: object) => signInMock(props),
  useAuth: () => useAuthMock(),
  useUser: () => useUserMock(),
}));

vi.mock('@helpers/auth/clerk.helper', () => ({
  resolveClerkToken: (...args: unknown[]) => resolveClerkTokenMock(...args),
}));

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: {
    apiEndpoint: 'https://api.genfeed.ai/v1',
  },
}));

vi.mock('./callback-redirect', () => ({
  redirectToCallback: (target: string) => redirectToCallbackMock(target),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => useSearchParamsMock(),
}));

vi.mock('@ui/layouts/auth/AuthFormLayout', () => ({
  default: ({ children }: { children: ReactNode }) => (
    <div data-testid="auth-form-layout">{children}</div>
  ),
}));

vi.mock('@ui/feedback/spinner/Spinner', () => ({
  default: () => <div data-testid="spinner" />,
}));

vi.mock('@genfeedai/ui', () => ({
  Code: ({
    children,
    className,
  }: {
    children: ReactNode;
    className?: string;
  }) => <code className={className}>{children}</code>,
}));

vi.mock('@ui/primitives/button', () => ({
  Button: ({
    children,
    disabled,
    onClick,
  }: {
    children: ReactNode;
    disabled?: boolean;
    onClick?: () => void;
  }) => (
    <button disabled={disabled} type="button" onClick={onClick}>
      {children}
    </button>
  ),
}));

vi.mock('@/components/ui/card', () => ({
  Card: ({ children }: { children: ReactNode }) => (
    <div data-testid="card">{children}</div>
  ),
  CardContent: ({ children }: { children: ReactNode }) => (
    <div data-testid="card-content">{children}</div>
  ),
}));

describe('CliAuthPage', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.useFakeTimers();
    redirectToCallbackMock.mockReset();
    resolveClerkTokenMock.mockReset();
    signInMock.mockClear();
    useSearchParamsMock.mockReset();
    useAuthMock.mockReset();
    useUserMock.mockReset();
    globalThis.fetch = originalFetch;

    useSearchParamsMock.mockReturnValue(
      new URLSearchParams('desktop=1&return_to=genfeedai-desktop://auth'),
    );
    useAuthMock.mockReturnValue({
      getToken: vi.fn(),
      isLoaded: true,
      isSignedIn: true,
    });
    useUserMock.mockReturnValue({
      user: {
        firstName: 'Desktop',
        id: 'user-123',
        lastName: 'User',
        primaryEmailAddress: {
          emailAddress: 'desktop@example.com',
        },
      },
    });
    resolveClerkTokenMock.mockResolvedValue('clerk-session-token');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    globalThis.fetch = originalFetch;
  });

  it('shows an explicit error when the desktop callback target is invalid', async () => {
    useSearchParamsMock.mockReturnValue(
      new URLSearchParams('desktop=1&return_to=https://evil.example/callback'),
    );

    render(<CliAuthPage />);

    await waitFor(() => {
      expect(screen.getByText('Authentication failed')).toBeInTheDocument();
    });
    expect(
      screen.getByText(
        'Invalid desktop callback target. Restart sign-in from the Genfeed Desktop app.',
      ),
    ).toBeInTheDocument();
    expect(redirectToCallbackMock).not.toHaveBeenCalled();
  });

  it('falls back to manual recovery when the desktop app does not open', async () => {
    globalThis.fetch = vi.fn(async () => {
      return new Response(JSON.stringify({ key: 'gf_desktop_key' }), {
        headers: {
          'content-type': 'application/json',
        },
        status: 200,
      });
    }) as typeof fetch;

    render(<CliAuthPage />);

    await waitFor(() => {
      expect(redirectToCallbackMock).toHaveBeenCalledWith(
        'genfeedai-desktop://auth?key=gf_desktop_key&userId=user-123&email=desktop%40example.com&name=Desktop+User',
      );
    });

    await act(async () => {
      vi.advanceTimersByTime(2_100);
    });

    await waitFor(() => {
      expect(screen.getByText('Authentication failed')).toBeInTheDocument();
    });
    expect(
      screen.getByText(
        'Genfeed Desktop did not open automatically. Make sure the app is installed, then try again or copy the key below.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('gf_desktop_key')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Try again' }),
    ).toBeInTheDocument();
  });
});
