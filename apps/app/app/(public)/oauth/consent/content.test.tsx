// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import OAuthConsentPage from './page';

const useAuthMock = vi.fn();
const useSearchParamsMock = vi.fn();
const resolveAuthTokenMock = vi.fn();
const redirectMock = vi.fn();

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => useAuthMock(),
}));

vi.mock('@helpers/auth/auth.helper', () => ({
  resolveAuthToken: (...args: unknown[]) => resolveAuthTokenMock(...args),
}));

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: {
    apiEndpoint: 'https://api.genfeed.ai/v1',
  },
}));

vi.mock('./redirect', () => ({
  redirectToOAuthClient: (target: string) => redirectMock(target),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => useSearchParamsMock(),
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('@ui/layouts/auth/AuthFormLayout', () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('@ui/primitives/button', () => ({
  Button: ({
    asChild,
    children,
    disabled,
    onClick,
  }: {
    asChild?: boolean;
    children: ReactNode;
    disabled?: boolean;
    onClick?: () => void;
  }) =>
    asChild ? (
      children
    ) : (
      <button disabled={disabled} type="button" onClick={onClick}>
        {children}
      </button>
    ),
}));

vi.mock('@/components/ui/card', () => ({
  Card: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CardContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

function oauthParams() {
  return new URLSearchParams({
    client_id: 'oauth_client',
    client_name: 'Claude',
    code_challenge: 'a'.repeat(43),
    code_challenge_method: 'S256',
    redirect_uri: 'https://claude.ai/oauth/callback',
    resource: 'https://mcp.genfeed.ai/mcp',
    scope: 'videos:read images:create',
    state: 'oauth-state-1234567890',
  });
}

describe('OAuthConsentPage', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    useSearchParamsMock.mockReturnValue(oauthParams());
    useAuthMock.mockReturnValue({
      getToken: vi.fn(),
      isLoaded: true,
      isSignedIn: true,
    });
    resolveAuthTokenMock.mockResolvedValue('session-token');
    redirectMock.mockReset();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it('preserves the full OAuth request through sign-in', () => {
    useAuthMock.mockReturnValue({
      getToken: vi.fn(),
      isLoaded: true,
      isSignedIn: false,
    });

    render(<OAuthConsentPage />);

    const link = screen.getByRole('link', { name: 'Sign in to continue' });
    const href = link.getAttribute('href') ?? '';
    expect(decodeURIComponent(href)).toContain(
      '/login?callbackUrl=/oauth/consent?client_id=oauth_client',
    );
    expect(decodeURIComponent(href)).toContain(
      'resource=https://mcp.genfeed.ai/mcp',
    );
  });

  it('shows human-readable scope labels', () => {
    render(<OAuthConsentPage />);

    expect(screen.getByText('Videos')).toBeInTheDocument();
    expect(screen.getByText('Images')).toBeInTheDocument();
    expect(screen.getByText('Returns to claude.ai')).toBeInTheDocument();
  });

  it.each<[string, boolean]>([
    ['Authorize', true],
    ['Deny', false],
  ])('posts the %s decision and performs a full redirect', async (label, approved) => {
    globalThis.fetch = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          redirectUrl: 'https://claude.ai/oauth/callback?code=one-time',
        }),
        { headers: { 'content-type': 'application/json' }, status: 200 },
      );
    }) as typeof fetch;

    render(<OAuthConsentPage />);
    fireEvent.click(screen.getByRole('button', { name: label }));

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://api.genfeed.ai/v1/oauth/authorize/decision',
        expect.objectContaining({
          body: expect.stringContaining(`"approved":${approved}`),
          headers: expect.objectContaining({
            Authorization: 'Bearer session-token',
          }),
          method: 'POST',
        }),
      );
      expect(redirectMock).toHaveBeenCalledWith(
        'https://claude.ai/oauth/callback?code=one-time',
      );
    });
  });
});
