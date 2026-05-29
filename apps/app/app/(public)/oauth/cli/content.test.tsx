// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
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
  const originalClipboard = navigator.clipboard;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    redirectToCallbackMock.mockReset();
    resolveClerkTokenMock.mockReset();
    signInMock.mockClear();
    useSearchParamsMock.mockReset();
    useAuthMock.mockReset();
    useUserMock.mockReset();
    globalThis.fetch = originalFetch;

    useSearchParamsMock.mockReturnValue(
      new URLSearchParams(
        'desktop=1&return_to=genfeedai-desktop://auth&code_challenge=desktop-challenge&code_challenge_method=S256&state=desktop-state',
      ),
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
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    globalThis.fetch = originalFetch;
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: originalClipboard,
    });
  });

  it('renders the Clerk sign-in flow with a port-preserving redirect', async () => {
    useSearchParamsMock.mockReturnValue(new URLSearchParams('port=4321'));
    useAuthMock.mockReturnValue({
      getToken: vi.fn(),
      isLoaded: true,
      isSignedIn: false,
    });

    render(<CliAuthPage />);

    expect(await screen.findByTestId('clerk-signin')).toBeInTheDocument();
    expect(signInMock).toHaveBeenCalledWith(
      expect.objectContaining({
        forceRedirectUrl: '/oauth/cli?port=4321',
        routing: 'hash',
      }),
    );
  });

  it('validates the required localhost callback port', async () => {
    useSearchParamsMock.mockReturnValue(new URLSearchParams('port=bad'));

    render(<CliAuthPage />);

    expect(
      await screen.findByText('Authentication failed'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Invalid port "bad". Port must be a number between 1024 and 65535.',
      ),
    ).toBeInTheDocument();

    useSearchParamsMock.mockReturnValue(new URLSearchParams());
    render(<CliAuthPage />);

    expect(
      await screen.findByText(
        'Missing port parameter. The CLI should open this page with a ?port= query parameter.',
      ),
    ).toBeInTheDocument();
  });

  it('completes legacy CLI token auth and supports copying the fallback key', async () => {
    useSearchParamsMock.mockReturnValue(new URLSearchParams('port=4321'));
    globalThis.fetch = vi.fn(async () => {
      return new Response(JSON.stringify({ key: 'gf_cli_key' }), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      });
    }) as typeof fetch;

    render(<CliAuthPage />);

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://api.genfeed.ai/v1/auth/cli/token',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer clerk-session-token',
          }),
          method: 'POST',
        }),
      );
      expect(redirectToCallbackMock).toHaveBeenCalledWith(
        expect.stringMatching(
          /^http:\/\/127\.0\.0\.1:4321\/callback\?key=gf_cli_key&state=/,
        ),
      );
    });

    await act(async () => {
      vi.advanceTimersByTime(2_100);
    });

    expect(
      await screen.findByText('Authentication complete'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('gf_cli_key');
      expect(
        screen.getByRole('button', { name: 'Copied' }),
      ).toBeInTheDocument();
    });
  });

  it('completes CLI PKCE auth through the desktop authorize endpoint', async () => {
    useSearchParamsMock.mockReturnValue(
      new URLSearchParams(
        'port=4321&code_challenge=cli-challenge&code_challenge_method=S256&state=cli-state',
      ),
    );
    globalThis.fetch = vi.fn(async () => {
      return new Response(JSON.stringify({ code: 'gf_cli_code' }), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      });
    }) as typeof fetch;

    render(<CliAuthPage />);

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://api.genfeed.ai/v1/auth/desktop/authorize',
        expect.objectContaining({
          body: JSON.stringify({
            codeChallenge: 'cli-challenge',
            codeChallengeMethod: 'S256',
            state: 'cli-state',
          }),
        }),
      );
      expect(redirectToCallbackMock).toHaveBeenCalledWith(
        'http://127.0.0.1:4321/callback?code=gf_cli_code&state=cli-state',
      );
    });
  });

  it('shows formatted server and token errors', async () => {
    useSearchParamsMock.mockReturnValue(new URLSearchParams('port=4321'));
    resolveClerkTokenMock.mockResolvedValueOnce(null);

    render(<CliAuthPage />);

    expect(
      await screen.findByText(
        'Failed to retrieve authentication token. Please try again.',
      ),
    ).toBeInTheDocument();

    resolveClerkTokenMock.mockResolvedValue('clerk-session-token');
    globalThis.fetch = vi.fn(async () => {
      return new Response(
        JSON.stringify({ errors: [{ message: 'Rate limit' }] }),
        {
          status: 429,
        },
      );
    }) as typeof fetch;

    render(<CliAuthPage />);

    expect(
      await screen.findByText(
        'Too many requests. Please wait a moment and try again.',
      ),
    ).toBeInTheDocument();
  });

  it('handles missing credentials and redirect exceptions', async () => {
    useSearchParamsMock.mockReturnValue(new URLSearchParams('port=4321'));
    globalThis.fetch = vi.fn(async () => {
      return new Response(JSON.stringify({}), { status: 200 });
    }) as typeof fetch;

    render(<CliAuthPage />);

    expect(
      await screen.findByText(
        'Server did not return an API key. Please try again.',
      ),
    ).toBeInTheDocument();

    globalThis.fetch = vi.fn(async () => {
      return new Response(JSON.stringify({ key: 'gf_cli_key' }), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      });
    }) as typeof fetch;
    redirectToCallbackMock.mockImplementationOnce(() => {
      throw new Error('callback blocked');
    });

    render(<CliAuthPage />);

    expect(await screen.findByText('callback blocked')).toBeInTheDocument();
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
      return new Response(JSON.stringify({ code: 'gf_desktop_code' }), {
        headers: {
          'content-type': 'application/json',
        },
        status: 200,
      });
    }) as typeof fetch;

    render(<CliAuthPage />);

    await waitFor(() => {
      expect(redirectToCallbackMock).toHaveBeenCalledWith(
        'genfeedai-desktop://auth?code=gf_desktop_code&state=desktop-state&userId=user-123&email=desktop%40example.com&name=Desktop+User',
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
        'Genfeed Desktop did not open automatically. Make sure the app is installed, then try again or copy the code below.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('gf_desktop_code')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Try again' }),
    ).toBeInTheDocument();
  });
});
