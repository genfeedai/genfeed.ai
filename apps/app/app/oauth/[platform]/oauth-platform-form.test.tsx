import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import OAuthPlatformForm from './oauth-platform-form';

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

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => mocks.getServicesService,
}));

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => mocks.authIdentity,
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../tests/next-intl.stub'
  );

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
    mocks.postVerify.mockResolvedValue(undefined);
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

    expect(mocks.push).toHaveBeenCalledWith('/settings/publishing');
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
    expect(mocks.push).not.toHaveBeenCalled();
  });
});
