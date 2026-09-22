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
  usePathname: () => '/',
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

function oauthParams(overrides: Record<string, string> = {}) {
  return new URLSearchParams({
    client_id: 'oauth_client',
    client_name: 'Claude',
    code_challenge: 'a'.repeat(43),
    code_challenge_method: 'S256',
    redirect_uri: 'https://claude.ai/oauth/callback',
    resource: 'https://mcp.genfeed.ai/mcp',
    scope: 'videos:read images:create',
    state: 'oauth-state-1234567890',
    ...overrides,
  });
}

function mockDecisionResponse(): void {
  globalThis.fetch = vi.fn(async () => {
    return new Response(
      JSON.stringify({
        redirectUrl: 'https://claude.ai/oauth/callback?code=one-time',
      }),
      { headers: { 'content-type': 'application/json' }, status: 200 },
    );
  }) as typeof fetch;
}

function lastDecisionBody(): Record<string, unknown> {
  const call = vi.mocked(globalThis.fetch).mock.calls.at(-1);
  const init = call?.[1] as RequestInit | undefined;
  return JSON.parse(String(init?.body)) as Record<string, unknown>;
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

  it.each([
    ['https://claude.ai/oauth/callback', 'Returns to claude.ai'],
    [
      'cursor://anysphere.cursor-mcp/oauth/callback',
      'Returns to cursor://anysphere.cursor-mcp',
    ],
    ['com.genfeed.desktop:/oauth/callback', 'Returns to com.genfeed.desktop:'],
  ])('names the app a %s redirect returns to', (redirectUri, expected) => {
    useSearchParamsMock.mockReturnValue(
      oauthParams({ redirect_uri: redirectUri }),
    );

    render(<OAuthConsentPage />);

    expect(screen.getByText(expected)).toBeInTheDocument();
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
    const loginUrl = new URL(href, 'https://app.genfeed.ai');
    const callbackUrl = loginUrl.searchParams.get('callbackUrl');
    expect(callbackUrl).not.toBeNull();

    const consentUrl = new URL(callbackUrl ?? '', 'https://app.genfeed.ai');
    expect(consentUrl.pathname).toBe('/oauth/consent');
    expect(consentUrl.searchParams.get('client_id')).toBe('oauth_client');
    expect(consentUrl.searchParams.get('resource')).toBe(
      'https://mcp.genfeed.ai/mcp',
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
  ])(
    'posts the %s decision and performs a full redirect',
    async (label, approved) => {
      mockDecisionResponse();

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
    },
  );

  it('renders and submits a PKCE-only request that omits state', async () => {
    const params = oauthParams();
    params.delete('state');
    useSearchParamsMock.mockReturnValue(params);
    mockDecisionResponse();

    render(<OAuthConsentPage />);

    expect(
      screen.queryByText('Invalid authorization request'),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Authorize' }));

    await waitFor(() => {
      expect(redirectMock).toHaveBeenCalledWith(
        'https://claude.ai/oauth/callback?code=one-time',
      );
    });
    const body = lastDecisionBody();
    expect(body).not.toHaveProperty('state');
    expect(body).toMatchObject({
      approved: true,
      code_challenge_method: 'S256',
      resource: 'https://mcp.genfeed.ai/mcp',
    });
  });

  it('forwards a supplied state unchanged', async () => {
    const state = 'short:state/with?reserved=chars';
    useSearchParamsMock.mockReturnValue(oauthParams({ state }));
    mockDecisionResponse();

    render(<OAuthConsentPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Deny' }));

    await waitFor(() => {
      expect(redirectMock).toHaveBeenCalled();
    });
    expect(lastDecisionBody()).toMatchObject({ approved: false, state });
  });

  it('still rejects a request missing a PKCE challenge', () => {
    const params = oauthParams();
    params.delete('code_challenge');
    useSearchParamsMock.mockReturnValue(params);

    render(<OAuthConsentPage />);

    expect(
      screen.getByText('Invalid authorization request'),
    ).toBeInTheDocument();
  });
});
