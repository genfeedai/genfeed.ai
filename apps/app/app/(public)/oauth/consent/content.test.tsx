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
const loginPropsMock = vi.fn();
const getMyOrganizationsMock = vi.fn();

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../tests/next-intl.stub'
  );
  return {
    useTranslations: (namespace: string) => translateFromCatalog(namespace),
  };
});

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => useAuthMock(),
}));

vi.mock('@helpers/auth/auth.helper', () => ({
  resolveAuthToken: (...args: unknown[]) => resolveAuthTokenMock(...args),
}));

vi.mock('@services/organization/organizations.service', () => ({
  OrganizationsService: {
    getInstance: () => ({ getMyOrganizations: () => getMyOrganizationsMock() }),
  },
}));

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: {
    apiEndpoint: 'https://api.genfeed.ai/v1',
  },
}));

vi.mock('@app/(public)/login/login-better-auth', () => ({
  default: (props: { title?: string }) => {
    loginPropsMock(props);
    return <h1>{props.title}</h1>;
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

function mockDecisionResponse(
  redirectUrl = 'https://claude.ai/oauth/callback?code=one-time',
): void {
  globalThis.fetch = vi.fn(async () => {
    return new Response(
      JSON.stringify({
        redirectUrl,
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
    getMyOrganizationsMock.mockResolvedValue([
      { id: 'org-1', label: 'First workspace', isActive: true },
    ]);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it('requires deliberate organization selection even when another workspace is active', async () => {
    getMyOrganizationsMock.mockResolvedValue([
      { id: 'org-1', label: 'First workspace', isActive: true },
      { id: 'org-2', label: 'Second workspace', isActive: false },
    ]);
    mockDecisionResponse();
    render(<OAuthConsentPage />);
    const first = await screen.findByRole('radio', { name: 'First workspace' });
    const second = screen.getByRole('radio', { name: 'Second workspace' });
    expect(first).not.toBeChecked();
    expect(second).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Authorize' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Authorize' }));
    expect(globalThis.fetch).not.toHaveBeenCalled();
    fireEvent.click(second);
    expect(screen.getByRole('button', { name: 'Authorize' })).toBeEnabled();
    expect(screen.getByText('Videos')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Authorize' }));
    await waitFor(() => expect(redirectMock).toHaveBeenCalled());
    expect(lastDecisionBody()).toMatchObject({
      approved: true,
      organizationId: 'org-2',
    });
  });

  it('shows the sole organization and grants it without another step', async () => {
    mockDecisionResponse();
    render(<OAuthConsentPage />);
    await screen.findByText('First workspace');
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Authorize' }));
    await waitFor(() => expect(redirectMock).toHaveBeenCalled());
    expect(lastDecisionBody()).toMatchObject({ organizationId: 'org-1' });
  });

  it('cannot grant while membership discovery is pending but can deny', async () => {
    getMyOrganizationsMock.mockReturnValue(new Promise(() => {}));
    mockDecisionResponse();
    render(<OAuthConsentPage />);
    expect(screen.getByRole('button', { name: 'Authorize' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Deny' }));
    await waitFor(() => expect(redirectMock).toHaveBeenCalled());
    expect(lastDecisionBody()).toMatchObject({ approved: false });
    expect(lastDecisionBody()).not.toHaveProperty('organizationId');
  });

  it.each(['error', 'empty'])(
    'blocks approval after a membership %s',
    async (failure) => {
      if (failure === 'error') {
        getMyOrganizationsMock.mockRejectedValue(
          new Error('Membership unavailable'),
        );
      } else {
        getMyOrganizationsMock.mockResolvedValue([]);
      }
      mockDecisionResponse();
      render(<OAuthConsentPage />);
      await screen.findByRole('alert');
      expect(screen.getByRole('button', { name: 'Authorize' })).toBeDisabled();
      expect(globalThis.fetch).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['https://claude.ai/oauth/callback', 'Returns to claude.ai'],
    [
      'cursor://anysphere.cursor-mcp/oauth/callback',
      'Returns to cursor://anysphere.cursor-mcp',
    ],
    ['com.genfeed.desktop:/oauth/callback', 'Returns to com.genfeed.desktop:'],
  ])(
    'names the app a %s redirect returns to',
    async (redirectUri, expected) => {
      useSearchParamsMock.mockReturnValue(
        oauthParams({ redirect_uri: redirectUri }),
      );

      render(<OAuthConsentPage />);

      expect(screen.getByText(expected)).toBeInTheDocument();
      await screen.findByText('First workspace');
    },
  );

  it('offers every sign-in and sign-up path in place, returning to this request (#6268)', () => {
    useAuthMock.mockReturnValue({
      getToken: vi.fn(),
      isLoaded: true,
      isSignedIn: false,
    });

    render(<OAuthConsentPage />);

    expect(
      screen.getByRole('heading', { name: /^Connect .+ to Genfeed$/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Authorize' }),
    ).not.toBeInTheDocument();
    expect(loginPropsMock).toHaveBeenCalled();
    const [{ callbackURL }] = loginPropsMock.mock.lastCall as [
      { callbackURL: string },
    ];

    const consentUrl = new URL(callbackURL, 'https://app.genfeed.ai');
    expect(consentUrl.pathname).toBe('/oauth/consent');
    expect(consentUrl.searchParams.get('client_id')).toBe('oauth_client');
    expect(consentUrl.searchParams.get('resource')).toBe(
      'https://mcp.genfeed.ai/mcp',
    );
  });

  it('shows human-readable scope labels', async () => {
    render(<OAuthConsentPage />);

    expect(screen.getByText('Videos')).toBeInTheDocument();
    expect(screen.getByText('Images')).toBeInTheDocument();
    expect(screen.getByText('Returns to claude.ai')).toBeInTheDocument();
    await screen.findByText('First workspace');
  });

  it.each<[string, boolean]>([
    ['Authorize', true],
    ['Deny', false],
  ])(
    'posts the %s decision and performs a full redirect',
    async (label, approved) => {
      mockDecisionResponse();

      render(<OAuthConsentPage />);
      if (approved) {
        await waitFor(() =>
          expect(screen.getByRole('button', { name: label })).toBeEnabled(),
        );
      }
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

  it('unlocks the page with a return link after handing off to a native app', async () => {
    mockDecisionResponse(
      'claude://claude.ai/mcp-auth-callback/sdk?code=one-time',
    );

    render(<OAuthConsentPage />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Authorize' })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Authorize' }));

    const link = await screen.findByRole('link', { name: /Return to/ });
    expect(link).toHaveAttribute(
      'href',
      'claude://claude.ai/mcp-auth-callback/sdk?code=one-time',
    );
    expect(screen.queryByRole('button', { name: 'Authorizing…' })).toBeNull();
  });

  it('resets a frozen submit state when restored from the back/forward cache', async () => {
    render(<OAuthConsentPage />);
    globalThis.fetch = vi.fn(() => new Promise(() => {})) as typeof fetch;
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Authorize' })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Authorize' }));
    expect(
      await screen.findByRole('button', { name: 'Authorizing…' }),
    ).toBeDisabled();

    const event = new Event('pageshow') as PageTransitionEvent;
    Object.defineProperty(event, 'persisted', { value: true });
    fireEvent(window, event);

    expect(
      await screen.findByRole('button', { name: 'Authorize' }),
    ).toBeEnabled();
  });

  it('renders and submits a PKCE-only request that omits state', async () => {
    const params = oauthParams();
    params.delete('state');
    useSearchParamsMock.mockReturnValue(params);
    mockDecisionResponse();

    render(<OAuthConsentPage />);

    expect(
      screen.queryByText('Invalid authorization request'),
    ).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Authorize' })).toBeEnabled(),
    );
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
