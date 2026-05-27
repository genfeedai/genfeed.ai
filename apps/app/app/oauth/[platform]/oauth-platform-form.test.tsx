import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import OAuthPlatformForm from './oauth-platform-form';

const mocks = vi.hoisted(() => ({
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

vi.mock('@services/core/logger.service', () => ({
  logger: {
    error: mocks.loggerError,
    info: mocks.loggerInfo,
  },
}));

vi.mock('@services/external/services.service', () => ({
  ServicesService: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mocks.push,
  }),
  useSearchParams: () => mocks.searchParams,
}));

describe('OAuthPlatformForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    expect(mocks.push).not.toHaveBeenCalled();
  });
});
