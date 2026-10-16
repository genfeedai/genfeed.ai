// @vitest-environment jsdom
'use client';

import { BrandProvider } from '@genfeedai/contexts/user/brand-context/brand-context';
import { UserProvider } from '@genfeedai/contexts/user/user-context/user-context';
import { AccessStateProvider } from '@providers/access-state/access-state.provider';
import {
  buildProtectedBootstrapCacheKey,
  clearClientProtectedBootstrapCache,
} from '@providers/protected-bootstrap/client-protected-bootstrap';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useAuthIdentityMock = vi.hoisted(() => vi.fn());
const getBootstrapMock = vi.hoisted(() => vi.fn());

vi.mock('@genfeedai/auth-client/react', () => ({
  useAuth: () => useAuthIdentityMock(),
}));

vi.mock('@genfeedai/hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => useAuthIdentityMock(),
}));

vi.mock('@genfeedai/hooks/auth/use-auth-user/use-auth-user', () => ({
  useAuthUser: () => ({ user: null }),
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({}),
  usePathname: () => '',
}));

vi.mock('@genfeedai/contexts/user/internal/context-authed-service', () => ({
  clearContextTokenCache: vi.fn(),
  useContextAuthedService:
    <T,>(factory: (token: string) => T) =>
    () =>
      Promise.resolve(factory('token')),
}));

vi.mock('@genfeedai/hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService:
    <T,>(factory: (token: string) => T) =>
    () =>
      Promise.resolve(factory('token')),
}));

vi.mock('@helpers/auth/auth.helper', () => ({
  getAuthPublicData: vi.fn(() => ({ brand: '', organization: '' })),
  getPlaywrightAuthState: vi.fn(() => null),
}));

vi.mock('@genfeedai/services/auth/auth.service', () => ({
  AuthService: {
    getInstance: () => ({ getBootstrap: getBootstrapMock }),
  },
}));

vi.mock('@genfeedai/services/organization/organizations.service', () => ({
  OrganizationsService: { getInstance: vi.fn(() => ({})) },
}));

vi.mock('@genfeedai/services/organization/users.service', () => ({
  UsersService: {
    getInstance: vi.fn(() => ({
      findAllMeBrands: vi.fn().mockResolvedValue([]),
      findMe: vi.fn().mockResolvedValue(null),
    })),
  },
}));

vi.mock('@genfeedai/services/core/interceptor.service', () => ({
  clearAllServiceInstances: vi.fn(),
}));

vi.mock('@genfeedai/services/core/logger.service', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock('@genfeedai/config/deployment', () => ({
  isSaaS: vi.fn(() => true),
  isSelfHostedDeployment: vi.fn(() => false),
}));

vi.mock('@genfeedai/config/license', () => ({
  hasOrganizationBillingHint: vi.fn(() => true),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { gcTime: 0, retry: false, staleTime: 0 },
    },
  });

  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe('protected bootstrap cache keys', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearClientProtectedBootstrapCache();
    getBootstrapMock.mockResolvedValue({
      access: { brandId: 'brand_1', organizationId: 'org_1' },
      brands: [],
      currentUser: { id: 'user_1' },
      settings: null,
    });
  });

  it('builds one key per user and organization scope', () => {
    expect(
      buildProtectedBootstrapCacheKey({
        organizationId: 'org_1',
        userId: 'user_1',
      }),
    ).toBe('protected-bootstrap:user_1:org_1');
    expect(
      buildProtectedBootstrapCacheKey({ organizationId: null, userId: null }),
    ).toBe('protected-bootstrap:none:no-org');
    expect(buildProtectedBootstrapCacheKey({ userId: 'user_1' })).toBe(
      buildProtectedBootstrapCacheKey({ organizationId: '', userId: 'user_1' }),
    );
  });

  it('requests the bootstrap once when the session has no organization', async () => {
    useAuthIdentityMock.mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
      orgId: null,
      userId: 'user_1',
    });

    const Wrapper = createWrapper();

    render(
      <Wrapper>
        <UserProvider>
          <BrandProvider>
            <AccessStateProvider>
              <div />
            </AccessStateProvider>
          </BrandProvider>
        </UserProvider>
      </Wrapper>,
    );

    await waitFor(() => expect(getBootstrapMock).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(getBootstrapMock).toHaveBeenCalledTimes(1);
  });
});
