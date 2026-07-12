import { useAgentOAuthConnect } from '@hooks/agent/use-agent-oauth-connect/use-agent-oauth-connect';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPostConnect = vi.fn();
const mockResolveAuthToken = vi.fn();
const mockUseParams = vi.fn();
let selectedBrand: { id: string } | undefined;

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
  logger: { error: vi.fn() },
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({ selectedBrand }),
}));

vi.mock('@helpers/auth/auth.helper', () => ({
  resolveAuthToken: (...args: unknown[]) => mockResolveAuthToken(...args),
}));

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => ({ getToken: vi.fn() }),
}));

vi.mock('@hooks/navigation/use-org-url/use-org-url', () => ({
  useOrgUrl: () => ({ orgHref: (path: string) => `/o${path}` }),
}));

vi.mock('next/navigation', () => ({
  useParams: () => mockUseParams(),
}));

describe('useAgentOAuthConnect', () => {
  const openSpy = vi
    .spyOn(window, 'open')
    .mockImplementation(() => null as unknown as Window);

  beforeEach(() => {
    vi.clearAllMocks();
    selectedBrand = undefined;
    mockUseParams.mockReturnValue({});
    mockResolveAuthToken.mockResolvedValue('token-abc');
    mockPostConnect.mockResolvedValue({ url: 'https://provider.test/oauth' });
  });

  it('connects and redirects with a standard-agent return_to', async () => {
    const { result } = renderHook(() => useAgentOAuthConnect());

    await act(async () => {
      await result.current('twitter');
    });

    expect(mockPostConnect).toHaveBeenCalledWith('twitter', 'token-abc', {});
    expect(openSpy).toHaveBeenCalledWith(
      `https://provider.test/oauth?return_to=${encodeURIComponent('/o/agent/new')}`,
      '_self',
    );
  });

  it('includes the active brand and threads the return_to when available', async () => {
    selectedBrand = { id: 'brand-9' };
    mockUseParams.mockReturnValue({ threadId: 'thread-5' });
    const { result } = renderHook(() =>
      useAgentOAuthConnect({ isOnboarding: true }),
    );

    await act(async () => {
      await result.current('linkedin');
    });

    expect(mockPostConnect).toHaveBeenCalledWith('linkedin', 'token-abc', {
      brand: 'brand-9',
    });
    expect(openSpy).toHaveBeenCalledWith(
      `https://provider.test/oauth?return_to=${encodeURIComponent('/o/agent/onboarding/thread-5')}`,
      '_self',
    );
  });

  it('does nothing when no auth token is available', async () => {
    mockResolveAuthToken.mockResolvedValue(null);
    const { result } = renderHook(() => useAgentOAuthConnect());

    await act(async () => {
      await result.current('twitter');
    });

    expect(mockPostConnect).not.toHaveBeenCalled();
    expect(openSpy).not.toHaveBeenCalled();
  });
});
