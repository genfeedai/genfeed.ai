import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import OAuthPlatformForm from './oauth-platform-form';

const mockInstagramAccountSelector = vi.fn();

const mocks = vi.hoisted(() => ({
  authIdentity: {
    isLoaded: true,
    isSignedIn: true,
  },
  getServicesService: vi.fn(),
  loggerError: vi.fn(),
  loggerInfo: vi.fn(),
  postVerify: vi.fn(),
  push: vi.fn(),
  searchParams: new URLSearchParams(),
}));

const { clearClientProtectedBootstrapCache } = vi.hoisted(() => ({
  clearClientProtectedBootstrapCache: vi.fn(),
}));

vi.mock(
  '@contexts/providers/protected-bootstrap/client-protected-bootstrap',
  () => ({ clearClientProtectedBootstrapCache }),
);

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => mocks.getServicesService,
}));

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => mocks.authIdentity,
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');

  return {
    useTranslations: () =>
      translateFromCatalog('common.oauth.platformCallback'),
  };
});

vi.mock('@services/core/logger.service', () => ({
  logger: {
    error: mocks.loggerError,
    info: mocks.loggerInfo,
  },
}));

vi.mock('@services/external/services.service', () => ({
  ServicesService: vi.fn(),
}));

vi.mock('@/components/analytics/AnalyticsPublicRouteSync', () => ({
  default: () => <div data-testid="analytics-public-route-sync" />,
}));

vi.mock('@ui/modals/brands/instagram/InstagramAccountSelector', () => ({
  default: (props: { credentialId: string; onConnected: () => void }) => {
    mockInstagramAccountSelector(props);
    return (
      <div data-testid="instagram-account-selector">
        <button onClick={props.onConnected} type="button">
          confirm-selection
        </button>
      </div>
    );
  },
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({
    push: mocks.push,
  }),
  useSearchParams: () => mocks.searchParams,
}));

describe('OAuthPlatformForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // The stored return path is per-test state: providers drop query params,
    // so a leak here would mask a regression in the sessionStorage channel.
    window.sessionStorage.clear();
    mocks.authIdentity = {
      isLoaded: true,
      isSignedIn: true,
    };
    const realSetTimeout = globalThis.setTimeout;
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(
      (callback, timeout, ...args) => {
        if (timeout === 3000 && typeof callback === 'function') {
          callback(...args);
          return 1 as unknown as ReturnType<typeof setTimeout>;
        }

        return realSetTimeout(callback, timeout, ...args);
      },
    );
    mocks.searchParams = new URLSearchParams({
      code: 'code-1',
      return_to: '/settings/publishing',
      state: 'state-1',
    });
    mocks.postVerify.mockResolvedValue({
      id: 'credential-1',
      isConnected: true,
    });
    mocks.getServicesService.mockResolvedValue({
      postVerify: mocks.postVerify,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('verifies an OAuth callback and redirects to the return path', async () => {
    render(<OAuthPlatformForm platform="instagram" />);

    expect(
      screen.getByText('Connecting your Instagram account…'),
    ).toBeVisible();
    expect(screen.getByTestId('analytics-public-route-sync')).toBeVisible();

    await waitFor(() => {
      expect(mocks.postVerify).toHaveBeenCalledWith({
        code: 'code-1',
        state: 'state-1',
      });
    });
    expect(mocks.loggerInfo).toHaveBeenCalledWith(
      'POST /services/instagram/verify success',
    );
    expect(screen.getByText('Instagram Connected')).toBeVisible();
    expect(
      document.querySelector('[data-connection-brand="Instagram"]'),
    ).toHaveStyle({ color: '#E1306C' });
    expect(clearClientProtectedBootstrapCache).toHaveBeenCalledTimes(1);

    expect(mocks.push).toHaveBeenCalledWith('/settings/publishing');
  });

  it('returns to the stored page when the provider drops query params', async () => {
    // Brand integrations store the origin page in sessionStorage because the
    // provider redirect drops query params (no return_to survives Twitter).
    // Literal key mirrors OAUTH_RETURN_TO_STORAGE_KEY without importing the
    // hook module into this test.
    mocks.searchParams = new URLSearchParams({
      code: 'code-1',
      state: 'state-1',
    });
    window.sessionStorage.setItem(
      'oauth_return_to',
      '/demo/acme/settings/connected-accounts',
    );

    render(<OAuthPlatformForm platform="twitter" />);

    await waitFor(() => {
      expect(mocks.postVerify).toHaveBeenCalledWith({
        code: 'code-1',
        state: 'state-1',
      });
    });

    expect(mocks.push).toHaveBeenCalledWith(
      '/demo/acme/settings/connected-accounts',
    );
    expect(window.sessionStorage.getItem('oauth_return_to')).toBeNull();
  });

  it('rejects a stored off-origin path and redirects to the default path', async () => {
    mocks.searchParams = new URLSearchParams({
      code: 'code-1',
      state: 'state-1',
    });
    window.sessionStorage.setItem('oauth_return_to', '//evil.com');

    render(<OAuthPlatformForm platform="twitter" />);

    await waitFor(() => {
      expect(mocks.postVerify).toHaveBeenCalledWith({
        code: 'code-1',
        state: 'state-1',
      });
    });

    expect(mocks.push).toHaveBeenCalledWith('/settings/api-keys');
    expect(mocks.push).not.toHaveBeenCalledWith(
      expect.stringContaining('evil.com'),
    );
  });

  it('rejects an off-origin return_to and redirects to the default path', async () => {
    mocks.searchParams = new URLSearchParams({
      code: 'code-1',
      return_to: '//evil.com',
      state: 'state-1',
    });

    render(<OAuthPlatformForm platform="instagram" />);

    await waitFor(() => {
      expect(mocks.postVerify).toHaveBeenCalledWith({
        code: 'code-1',
        state: 'state-1',
      });
    });

    expect(mocks.push).toHaveBeenCalledWith('/settings/api-keys');
    expect(mocks.push).not.toHaveBeenCalledWith(
      expect.stringContaining('evil.com'),
    );
  });

  it('forwards the X Ads OAuth 1.0a request token and verifier', async () => {
    mocks.searchParams = new URLSearchParams({
      oauth_token: 'request-token',
      oauth_verifier: 'oauth-verifier',
      return_to: '/settings/publishing',
    });

    render(<OAuthPlatformForm platform="x-ads" />);

    await waitFor(() => {
      expect(mocks.postVerify).toHaveBeenCalledWith({
        oauthToken: 'request-token',
        oauthVerifier: 'oauth-verifier',
      });
    });
    expect(mocks.push).toHaveBeenCalledWith('/settings/publishing');
  });

  it('waits for the authenticated session to hydrate before verifying', async () => {
    mocks.authIdentity = {
      isLoaded: false,
      isSignedIn: false,
    };
    const { rerender } = render(<OAuthPlatformForm platform="twitter" />);

    expect(mocks.getServicesService).not.toHaveBeenCalled();

    mocks.authIdentity = {
      isLoaded: true,
      isSignedIn: true,
    };
    rerender(<OAuthPlatformForm platform="twitter" />);

    await waitFor(() => {
      expect(mocks.postVerify).toHaveBeenCalledWith({
        code: 'code-1',
        state: 'state-1',
      });
    });
    expect(mocks.getServicesService).toHaveBeenCalledTimes(1);
  });

  it('preserves the callback through sign-in when the session expired', () => {
    mocks.authIdentity = {
      isLoaded: true,
      isSignedIn: false,
    };

    render(<OAuthPlatformForm platform="twitter" />);

    expect(mocks.getServicesService).not.toHaveBeenCalled();
    expect(
      screen.getByRole('link', { name: 'Sign in to continue' }),
    ).toHaveAttribute(
      'href',
      `/login?callbackUrl=${encodeURIComponent(
        '/oauth/twitter?code=code-1&return_to=%2Fsettings%2Fpublishing&state=state-1',
      )}`,
    );
  });

  it('retries verification without requiring another provider redirect', async () => {
    mocks.getServicesService
      .mockRejectedValueOnce(new Error('Authentication token unavailable'))
      .mockResolvedValueOnce({
        postVerify: mocks.postVerify,
      });

    render(<OAuthPlatformForm platform="twitter" />);

    const retry = await screen.findByRole('button', { name: 'Try again' });
    fireEvent.click(retry);

    await waitFor(() => {
      expect(mocks.postVerify).toHaveBeenCalledWith({
        code: 'code-1',
        state: 'state-1',
      });
    });
    expect(mocks.getServicesService).toHaveBeenCalledTimes(2);
  });

  it('persists a provider denial through verify instead of exchanging a code', async () => {
    mocks.searchParams = new URLSearchParams({
      error: 'access_denied',
      return_to: '/settings/publishing',
      state: 'state-1',
    });
    mocks.postVerify.mockRejectedValueOnce(new Error('Authorization denied'));

    render(<OAuthPlatformForm platform="twitter" />);

    await waitFor(() => {
      expect(mocks.postVerify).toHaveBeenCalledWith({
        error: 'access_denied',
        state: 'state-1',
      });
    });
    expect(screen.getByText('Connection Failed')).toBeVisible();
    expect(
      screen.getByText(
        'Authorization was denied. You can try connecting again.',
      ),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Try again' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Restart authorization' }),
    ).not.toBeInTheDocument();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it('renders failure state and default back link when verification fails', async () => {
    mocks.searchParams = new URLSearchParams({ code: 'bad-code' });
    mocks.postVerify.mockRejectedValueOnce(new Error('verify failed'));

    render(<OAuthPlatformForm platform="youtube" />);

    await waitFor(() => {
      expect(mocks.loggerError).toHaveBeenCalledWith(
        'POST /services/youtube/verify failed',
        expect.any(Error),
      );
    });

    expect(screen.getByText('Connection Failed')).toBeVisible();
    expect(
      screen.getByText('Failed to verify your account. Please try again.'),
    ).toBeVisible();
    expect(screen.getByText('Go back')).toHaveAttribute(
      'href',
      '/settings/api-keys',
    );
    expect(
      screen.queryByRole('button', { name: 'Try again' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Restart authorization' }),
    ).toBeVisible();
    expect(mocks.push).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole('button', { name: 'Restart authorization' }),
    );
    expect(mocks.push).toHaveBeenCalledWith('/settings/api-keys');
    expect(mocks.postVerify).toHaveBeenCalledTimes(1);
  });

  it('explains a missing YouTube channel and starts a fresh authorization', async () => {
    const brandId = '11111111-1111-4111-8111-111111111111';
    const credentialId = '22222222-2222-4222-8222-222222222222';
    window.sessionStorage.setItem(
      'oauth_connect_context',
      JSON.stringify({ brandId, credentialId }),
    );
    const postConnect = vi.fn().mockResolvedValue({
      id: credentialId,
      url: 'https://accounts.google.com/o/oauth2/v2/auth?state=fresh',
    });
    mocks.getServicesService.mockResolvedValue({
      postConnect,
      postVerify: mocks.postVerify,
    });
    mocks.postVerify.mockRejectedValueOnce({
      errors: [
        {
          code: 'youtube_channel_missing',
          detail:
            'No YouTube channel was found for the selected Google account.',
          status: '400',
          title: 'No YouTube channel found',
        },
      ],
    });
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    render(<OAuthPlatformForm platform="youtube" />);

    expect(await screen.findByText('No YouTube channel found')).toBeVisible();
    expect(
      screen.getByText(
        'No YouTube channel was found for the Google account you selected. Restart authorization and choose the YouTube channel or Brand Account, not only the Google identity.',
      ),
    ).toBeVisible();
    expect(
      screen.queryByText('Failed to verify your account. Please try again.'),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Restart authorization' }),
    );

    await waitFor(() => {
      expect(postConnect).toHaveBeenCalledWith({
        brandId,
        credentialId,
      });
    });
    expect(mocks.postVerify).toHaveBeenCalledTimes(1);
    expect(openSpy).toHaveBeenCalledWith(
      'https://accounts.google.com/o/oauth2/v2/auth?state=fresh&return_to=%2Fsettings%2Fpublishing',
      '_self',
    );
    const logged = JSON.stringify(mocks.loggerError.mock.calls);
    expect(logged).not.toContain('code-1');
    expect(logged).not.toContain('state-1');
  });

  it.each([
    [
      'youtube_token_exchange_failed',
      'YouTube could not exchange this authorization. Restart the connection and try again.',
    ],
    [
      'youtube_missing_scopes',
      'YouTube did not grant the permissions this connection needs. Restart authorization and accept the requested access.',
    ],
    [
      'youtube_provider_failure',
      'YouTube could not verify this account. Restart the connection and try again.',
    ],
    [
      'youtube_state_invalid',
      'This YouTube connection session is no longer valid. Restart authorization to try again.',
    ],
    [
      'youtube_access_denied',
      'Authorization was denied. You can try connecting again.',
    ],
    ['youtube_unknown', 'Failed to verify your account. Please try again.'],
  ])(
    'keeps YouTube %s distinct from a missing channel',
    async (code, message) => {
      mocks.postVerify.mockRejectedValueOnce({
        errors: [
          {
            code,
            detail: `secret code=code-1 state=state-1 token=yt_access`,
            status: '400',
            title: 'Provider detail',
          },
        ],
      });

      render(<OAuthPlatformForm platform="youtube" />);

      expect(await screen.findByText(message)).toBeVisible();
      expect(
        screen.queryByText('No YouTube channel found'),
      ).not.toBeInTheDocument();
      expect(screen.queryByText(/code-1/)).not.toBeInTheDocument();
      expect(screen.queryByText(/yt_access/)).not.toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Restart authorization' }),
      ).toBeVisible();
      expect(
        screen.queryByRole('button', { name: 'Try again' }),
      ).not.toBeInTheDocument();
    },
  );

  it('shows the Instagram account picker instead of redirecting when the connection needs selection', async () => {
    mocks.postVerify.mockResolvedValue({
      id: 'credential-ambiguous',
      isConnected: false,
      needsAccountSelection: true,
    });

    render(<OAuthPlatformForm platform="instagram" />);

    await waitFor(() => {
      expect(screen.getByTestId('instagram-account-selector')).toBeVisible();
    });
    expect(mockInstagramAccountSelector).toHaveBeenCalledWith(
      expect.objectContaining({ credentialId: 'credential-ambiguous' }),
    );
    expect(screen.queryByText('Instagram Connected')).not.toBeInTheDocument();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it('completes the redirect once the operator confirms a selected Instagram account', async () => {
    mocks.postVerify.mockResolvedValue({
      id: 'credential-ambiguous',
      isConnected: false,
      needsAccountSelection: true,
    });

    render(<OAuthPlatformForm platform="instagram" />);

    const confirmButton = await screen.findByText('confirm-selection');
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(screen.getByText('Instagram Connected')).toBeVisible();
    });
    expect(clearClientProtectedBootstrapCache).toHaveBeenCalledTimes(1);
    expect(mocks.push).toHaveBeenCalledWith('/settings/publishing');
  });

  it('does not show the picker for an unconnected credential the server has not flagged for selection', async () => {
    // isConnected: false alone is not the signal — a lapsed token or a
    // never-completed OAuth attempt looks the same and has no selection
    // waiting. Only the explicit needsAccountSelection field triggers it.
    mocks.postVerify.mockResolvedValue({
      id: 'credential-1',
      isConnected: false,
      needsAccountSelection: false,
    });

    render(<OAuthPlatformForm platform="youtube" />);

    await waitFor(() => {
      expect(screen.getByText('YouTube Connected')).toBeVisible();
    });
    expect(
      screen.queryByTestId('instagram-account-selector'),
    ).not.toBeInTheDocument();
  });
});
