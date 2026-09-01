import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPostConnect = vi.fn();
const mockResolveAuthToken = vi.fn();
const mockLoggerError = vi.hoisted(() => vi.fn());
let selectedBrand: { id: string } | undefined;
let searchString = '';

vi.mock('@services/external/services.service', () => ({
  ServicesService: class {
    constructor(
      public platform: string,
      public token: string,
    ) {}
    postConnect(body: unknown) {
      return mockPostConnect(this.platform, this.token, body);
    }
  },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { error: mockLoggerError },
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({ selectedBrand }),
}));

vi.mock('@contexts/user/brand-context/brand-context.helpers', () => ({
  getBrandEntityId: (brand: { id: string }) => brand.id,
}));

vi.mock('@helpers/auth/auth.helper', () => ({
  resolveAuthToken: (...args: unknown[]) => mockResolveAuthToken(...args),
}));

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => ({ getToken: vi.fn() }),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/acme/brand/settings',
  useSearchParams: () => new URLSearchParams(searchString),
}));

import {
  OAUTH_RETURN_TO_STORAGE_KEY,
  usePlatformOAuthConnect,
} from './use-platform-oauth-connect';

describe('usePlatformOAuthConnect', () => {
  const openSpy = vi
    .spyOn(window, 'open')
    .mockImplementation(() => null as unknown as Window);
  const setItemSpy = vi.spyOn(
    Object.getPrototypeOf(window.sessionStorage) as Storage,
    'setItem',
  );

  beforeEach(() => {
    vi.clearAllMocks();
    selectedBrand = { id: 'brand-1' };
    searchString = '';
    mockResolveAuthToken.mockResolvedValue('token-abc');
    mockPostConnect.mockResolvedValue({ url: 'https://provider.test/oauth' });
  });

  it('connects and redirects with the current path as return_to', async () => {
    const { result } = renderHook(() => usePlatformOAuthConnect());

    await act(async () => {
      await result.current('twitter');
    });

    expect(mockPostConnect).toHaveBeenCalledWith('twitter', 'token-abc', {
      brandId: 'brand-1',
    });
    expect(setItemSpy).toHaveBeenCalledWith(
      OAUTH_RETURN_TO_STORAGE_KEY,
      '/acme/brand/settings',
    );
    expect(openSpy).toHaveBeenCalledWith(
      `https://provider.test/oauth?return_to=${encodeURIComponent('/acme/brand/settings')}`,
      '_self',
    );
  });

  it('includes the query string in the default return_to', async () => {
    searchString = 'tab=accounts';
    const { result } = renderHook(() => usePlatformOAuthConnect());

    await act(async () => {
      await result.current('twitter');
    });

    expect(setItemSpy).toHaveBeenCalledWith(
      OAUTH_RETURN_TO_STORAGE_KEY,
      '/acme/brand/settings?tab=accounts',
    );
  });

  it('prefers an explicit returnTo and brandId', async () => {
    const { result } = renderHook(() =>
      usePlatformOAuthConnect({ brandId: 'brand-9', returnTo: '/custom' }),
    );

    await act(async () => {
      await result.current('linkedin');
    });

    expect(mockPostConnect).toHaveBeenCalledWith('linkedin', 'token-abc', {
      brandId: 'brand-9',
    });
    expect(openSpy).toHaveBeenCalledWith(
      `https://provider.test/oauth?return_to=${encodeURIComponent('/custom')}`,
      '_self',
    );
  });

  it('appends return_to with & when the provider url has a query', async () => {
    mockPostConnect.mockResolvedValue({
      url: 'https://provider.test/oauth?state=1',
    });
    const { result } = renderHook(() => usePlatformOAuthConnect());

    await act(async () => {
      await result.current('twitter');
    });

    expect(openSpy).toHaveBeenCalledWith(
      `https://provider.test/oauth?state=1&return_to=${encodeURIComponent('/acme/brand/settings')}`,
      '_self',
    );
  });

  it('does nothing without an auth token', async () => {
    mockResolveAuthToken.mockResolvedValue(null);
    const { result } = renderHook(() => usePlatformOAuthConnect());

    await act(async () => {
      await result.current('twitter');
    });

    expect(mockPostConnect).not.toHaveBeenCalled();
    expect(openSpy).not.toHaveBeenCalled();
  });

  it('rejects when no brand is available', async () => {
    selectedBrand = undefined;
    const { result } = renderHook(() => usePlatformOAuthConnect());

    await expect(result.current('twitter')).rejects.toThrow(
      'Select a brand before connecting an account',
    );

    expect(mockPostConnect).not.toHaveBeenCalled();
  });

  it('does not fall back to the selected brand when brandId is explicitly null', async () => {
    const { result } = renderHook(() =>
      usePlatformOAuthConnect({ brandId: null }),
    );

    await expect(result.current('twitter')).rejects.toThrow(
      'Select a brand before connecting an account',
    );

    expect(mockPostConnect).not.toHaveBeenCalled();
  });

  it('logs and rethrows connect failures', async () => {
    const error = new Error('OAuth unavailable');
    mockPostConnect.mockRejectedValue(error);
    const { result } = renderHook(() => usePlatformOAuthConnect());

    await expect(result.current('twitter')).rejects.toThrow(
      'OAuth unavailable',
    );

    expect(mockLoggerError).toHaveBeenCalledWith('OAuth connect failed', error);
    expect(openSpy).not.toHaveBeenCalled();
  });
});
