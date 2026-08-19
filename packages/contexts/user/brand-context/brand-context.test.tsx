// @vitest-environment jsdom
'use client';

import {
  BrandProvider,
  useBrand,
} from '@genfeedai/contexts/user/brand-context/brand-context';
import { testId } from '@genfeedai/helpers/testing/test-id.helper';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useAuthMock = vi.fn();
const useParamsMock = vi.fn();
const usePathnameMock = vi.fn(() => '');
const useUserMock = vi.fn();
const useAuthedServiceMock = vi.fn();
const loadClientProtectedBootstrapMock = vi.hoisted(() => vi.fn());
const authServiceGetInstanceMock = vi.hoisted(() => vi.fn());

vi.mock('@genfeedai/auth-client/react', () => ({
  useAuth: () => useAuthMock(),
  useUser: () => useUserMock(),
}));

vi.mock('@genfeedai/hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => useAuthMock(),
}));

vi.mock('@genfeedai/hooks/auth/use-auth-user/use-auth-user', () => ({
  useAuthUser: () => useUserMock(),
}));

vi.mock('next/navigation', () => ({
  useParams: () => useParamsMock(),
  usePathname: () => usePathnameMock(),
}));

vi.mock('../internal/context-authed-service', () => ({
  clearContextTokenCache: vi.fn(),
  useContextAuthedService: () => useAuthedServiceMock,
}));

vi.mock('@helpers/auth/auth.helper', () => ({
  getAuthPublicData: vi.fn((user: { publicMetadata?: unknown }) => {
    const meta = (user?.publicMetadata ?? {}) as Record<string, string>;
    return { brand: meta.brand ?? '', organization: meta.organization ?? '' };
  }),
  getPlaywrightAuthState: vi.fn(() => null),
}));

vi.mock('@genfeedai/services/organization/organizations.service', () => ({
  OrganizationsService: {
    getInstance: vi.fn(),
  },
}));

vi.mock('@genfeedai/services/organization/users.service', () => ({
  UsersService: {
    getInstance: vi.fn(),
  },
}));

vi.mock('@genfeedai/services/auth/auth.service', () => ({
  AuthService: {
    getInstance: authServiceGetInstanceMock,
  },
}));

vi.mock('@genfeedai/services/core/interceptor.service', () => ({
  clearAllServiceInstances: vi.fn(),
}));

vi.mock('@genfeedai/services/core/logger.service', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

const clearClientProtectedBootstrapCacheMock = vi.hoisted(() => vi.fn());

vi.mock(
  '../../providers/protected-bootstrap/client-protected-bootstrap',
  () => ({
    clearClientProtectedBootstrapCache: clearClientProtectedBootstrapCacheMock,
    loadClientProtectedBootstrap: loadClientProtectedBootstrapMock,
  }),
);

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

describe('BrandProvider', () => {
  const enabledModelId = testId('model');

  const initialBootstrap = {
    accessState: null,
    brandId: 'brand_123',
    brands: [
      {
        _id: 'brand_123',
        id: 'brand_123',
        label: 'Alpha',
      },
    ],
    currentUser: null,
    fleetCapabilities: {
      brandEnabled: true,
      brandId: 'brand_123',
      fleet: {
        images: true,
        llm: true,
        videos: true,
        voices: true,
      },
      id: 'fleet-capabilities:org_123:brand_123',
      organizationId: 'org_123',
    },
    organizationId: 'org_123',
    settings: {
      enabledModelIds: [enabledModelId],
      organization: 'org_123',
    },
    streak: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.NEXT_PUBLIC_GENFEED_CLOUD;
    delete process.env.NEXT_PUBLIC_BETTER_AUTH_ENABLED;
    useAuthedServiceMock.mockReset();
    loadClientProtectedBootstrapMock.mockResolvedValue(null);
    authServiceGetInstanceMock.mockReturnValue({});
    useParamsMock.mockReturnValue({});
    usePathnameMock.mockReturnValue('');
    useAuthMock.mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
      orgId: 'org_123',
      userId: 'authProvider_123',
    });
    useUserMock.mockReturnValue({
      user: {
        publicMetadata: {
          brand: 'brand_123',
          organization: 'org_123',
        },
      },
    });
  });

  it('hydrates brand, settings, and fleet state from the bootstrap payload', () => {
    function Consumer() {
      const { brandId, brands, fleetCapabilities, organizationId, settings } =
        useBrand();

      return (
        <div>
          <span data-testid="brand-id">{brandId}</span>
          <span data-testid="organization-id">{organizationId}</span>
          <span data-testid="brand-count">{String(brands.length)}</span>
          <span data-testid="enabled-models">
            {String(settings?.enabledModelIds?.length ?? 0)}
          </span>
          <span data-testid="enabled-model-id">
            {String(settings?.enabledModelIds?.[0] ?? '')}
          </span>
          <span data-testid="fleet-brand-enabled">
            {String(fleetCapabilities?.brandEnabled)}
          </span>
        </div>
      );
    }

    const Wrapper = createWrapper();

    render(
      <Wrapper>
        <BrandProvider initialBootstrap={initialBootstrap as never}>
          <Consumer />
        </BrandProvider>
      </Wrapper>,
    );

    expect(screen.getByTestId('brand-id')).toHaveTextContent('brand_123');
    expect(screen.getByTestId('organization-id')).toHaveTextContent('org_123');
    expect(screen.getByTestId('brand-count')).toHaveTextContent('1');
    expect(screen.getByTestId('enabled-models')).toHaveTextContent('1');
    expect(screen.getByTestId('enabled-model-id')).toHaveTextContent(
      enabledModelId,
    );
    expect(screen.getByTestId('fleet-brand-enabled')).toHaveTextContent('true');
  });

  it('uses bootstrap data without triggering service calls on mount', () => {
    function Consumer() {
      const { brandId, organizationId } = useBrand();

      return (
        <div>
          <span data-testid="brand-id">{brandId}</span>
          <span data-testid="organization-id">{organizationId}</span>
        </div>
      );
    }

    const Wrapper = createWrapper();

    render(
      <Wrapper>
        <BrandProvider initialBootstrap={initialBootstrap as never}>
          <Consumer />
        </BrandProvider>
      </Wrapper>,
    );

    expect(screen.getByTestId('brand-id')).toHaveTextContent('brand_123');
    expect(screen.getByTestId('organization-id')).toHaveTextContent('org_123');
    expect(useAuthedServiceMock).not.toHaveBeenCalled();
  });

  it('treats empty bootstrap brands as hydrated data', () => {
    const emptyBootstrap = {
      ...initialBootstrap,
      brandId: '',
      brands: [],
      fleetCapabilities: null,
      organizationId: '',
      settings: null,
    };

    function Consumer() {
      const { brandId, brands, organizationId, settings } = useBrand();

      return (
        <div>
          <span data-testid="brand-id">{brandId || 'none'}</span>
          <span data-testid="organization-id">{organizationId || 'none'}</span>
          <span data-testid="brand-count">{String(brands.length)}</span>
          <span data-testid="settings">{settings ? 'present' : 'none'}</span>
        </div>
      );
    }

    const Wrapper = createWrapper();

    render(
      <Wrapper>
        <BrandProvider initialBootstrap={emptyBootstrap as never}>
          <Consumer />
        </BrandProvider>
      </Wrapper>,
    );

    expect(screen.getByTestId('brand-id')).toHaveTextContent('none');
    expect(screen.getByTestId('organization-id')).toHaveTextContent('none');
    expect(screen.getByTestId('brand-count')).toHaveTextContent('0');
    expect(screen.getByTestId('settings')).toHaveTextContent('none');
    expect(useAuthedServiceMock).not.toHaveBeenCalled();
  });

  it('resolves brand scope immediately from a hydrated bootstrap payload', () => {
    function Consumer() {
      const { isBrandScopeResolved } = useBrand();

      return (
        <span data-testid="brand-scope-resolved">
          {String(isBrandScopeResolved)}
        </span>
      );
    }

    const Wrapper = createWrapper();

    render(
      <Wrapper>
        <BrandProvider initialBootstrap={initialBootstrap as never}>
          <Consumer />
        </BrandProvider>
      </Wrapper>,
    );

    expect(screen.getByTestId('brand-scope-resolved')).toHaveTextContent(
      'true',
    );
  });

  it('holds brand scope unresolved until the brand fetch settles', async () => {
    useAuthedServiceMock.mockResolvedValue({
      findAllMeBrands: vi.fn().mockResolvedValue([
        {
          id: 'brand_fetched',
          label: 'Fetched Brand',
          organization: { id: 'org_123', slug: 'acme-org' },
          slug: 'fetched-brand',
        },
      ]),
    });

    function Consumer() {
      const { brands, isBrandScopeResolved } = useBrand();

      return (
        <div>
          <span data-testid="brand-count">{String(brands.length)}</span>
          <span data-testid="brand-scope-resolved">
            {String(isBrandScopeResolved)}
          </span>
        </div>
      );
    }

    const Wrapper = createWrapper();

    render(
      <Wrapper>
        <BrandProvider initialBootstrap={null}>
          <Consumer />
        </BrandProvider>
      </Wrapper>,
    );

    // An empty list here means "not fetched yet" — consumers must not read it
    // as "no authorized brands" (#2702).
    expect(screen.getByTestId('brand-count')).toHaveTextContent('0');
    expect(screen.getByTestId('brand-scope-resolved')).toHaveTextContent(
      'false',
    );

    await waitFor(() => {
      expect(screen.getByTestId('brand-scope-resolved')).toHaveTextContent(
        'true',
      );
      expect(screen.getByTestId('brand-count')).toHaveTextContent('1');
    });
  });

  it('shows empty state when auth is not ready', () => {
    useAuthMock.mockReturnValue({
      isLoaded: false,
      isSignedIn: false,
      orgId: null,
      userId: null,
    });
    useUserMock.mockReturnValue({ user: null });

    function Consumer() {
      const { brandId, brands, organizationId } = useBrand();

      return (
        <div>
          <span data-testid="brand-id">{brandId}</span>
          <span data-testid="organization-id">{organizationId}</span>
          <span data-testid="brand-count">{String(brands.length)}</span>
        </div>
      );
    }

    const Wrapper = createWrapper();

    render(
      <Wrapper>
        <BrandProvider initialBootstrap={null}>
          <Consumer />
        </BrandProvider>
      </Wrapper>,
    );

    expect(screen.getByTestId('brand-count')).toHaveTextContent('0');
  });

  it('prefers the route organization over stale bootstrap context on org-scoped pages', async () => {
    useParamsMock.mockReturnValue({
      orgSlug: 'route-org',
    });

    const crossOrgBootstrap = {
      ...initialBootstrap,
      brandId: 'brand_old',
      brands: [
        {
          id: 'brand_old',
          label: 'Old Brand',
          organization: {
            id: 'org_old',
            slug: 'old-org',
          },
          slug: 'old-brand',
        },
        {
          id: 'brand_route',
          label: 'Route Brand',
          organization: {
            id: 'org_route',
            slug: 'route-org',
          },
          slug: 'route-brand',
        },
      ],
      organizationId: 'org_old',
    };

    function Consumer() {
      const { brandId, organizationId } = useBrand();

      return (
        <div>
          <span data-testid="brand-id">{brandId}</span>
          <span data-testid="organization-id">{organizationId}</span>
        </div>
      );
    }

    const Wrapper = createWrapper();

    render(
      <Wrapper>
        <BrandProvider initialBootstrap={crossOrgBootstrap as never}>
          <Consumer />
        </BrandProvider>
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('brand-id')).toHaveTextContent('');
      expect(screen.getByTestId('organization-id')).toHaveTextContent(
        'org_route',
      );
    });
  });

  it('prefers the pathname brand over a stale JWT brand when layout params are missing', async () => {
    useParamsMock.mockReturnValue({});
    usePathnameMock.mockReturnValue('/demo/FUDNEWS/library/images');
    const patchMeBrand = vi.fn().mockResolvedValue({});
    useAuthedServiceMock.mockResolvedValue({
      findAllMeBrands: vi.fn().mockResolvedValue([]),
      patchMeBrand,
    });
    loadClientProtectedBootstrapMock.mockResolvedValue(null);

    const demoBootstrap = {
      ...initialBootstrap,
      brandId: 'brand_boxing',
      brands: [
        {
          id: 'brand_boxing',
          label: 'Boxing Couple',
          organization: {
            id: 'org_demo',
            slug: 'demo',
          },
          slug: 'boxingcouple',
        },
        {
          id: 'brand_fud',
          label: 'FUD News',
          organization: {
            id: 'org_demo',
            slug: 'demo',
          },
          slug: 'FUDNEWS',
        },
      ],
      organizationId: 'org_demo',
    };

    function Consumer() {
      const { brandId, selectedBrand } = useBrand();

      return (
        <div>
          <span data-testid="brand-id">{brandId}</span>
          <span data-testid="selected-brand">{selectedBrand?.label}</span>
        </div>
      );
    }

    const Wrapper = createWrapper();

    render(
      <Wrapper>
        <BrandProvider initialBootstrap={demoBootstrap as never}>
          <Consumer />
        </BrandProvider>
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('brand-id')).toHaveTextContent('brand_fud');
      expect(screen.getByTestId('selected-brand')).toHaveTextContent(
        'FUD News',
      );
    });
    await waitFor(() => {
      expect(patchMeBrand).toHaveBeenCalledWith('brand_fud', {
        isSelected: true,
      });
    });
  });

  it('keeps org-scoped pages in no-brand mode instead of auto-selecting the first brand', async () => {
    useParamsMock.mockReturnValue({
      orgSlug: 'route-org',
    });

    const orgScopedBootstrap = {
      ...initialBootstrap,
      brandId: '',
      brands: [
        {
          id: 'brand_route',
          label: 'Route Brand',
          organization: {
            id: 'org_route',
            slug: 'route-org',
          },
          slug: 'route-brand',
        },
      ],
      organizationId: 'org_route',
    };

    function Consumer() {
      const { brandId, isReady, organizationId } = useBrand();

      return (
        <div>
          <span data-testid="brand-id">{brandId}</span>
          <span data-testid="organization-id">{organizationId}</span>
          <span data-testid="is-ready">{String(isReady)}</span>
        </div>
      );
    }

    const Wrapper = createWrapper();

    render(
      <Wrapper>
        <BrandProvider initialBootstrap={orgScopedBootstrap as never}>
          <Consumer />
        </BrandProvider>
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('brand-id')).toHaveTextContent('');
      expect(screen.getByTestId('organization-id')).toHaveTextContent(
        'org_route',
      );
      expect(screen.getByTestId('is-ready')).toHaveTextContent('true');
    });
  });

  it('resolves organizationId from a brand when the org slug is not nested on the brand', async () => {
    useParamsMock.mockReturnValue({
      orgSlug: 'default-organization',
    });

    const bootstrapWithoutNestedSlug = {
      ...initialBootstrap,
      brandId: '',
      brands: [
        {
          id: 'brand_seed',
          label: 'Seed',
          organizationId: 'org_owned',
          slug: 'seed',
        },
      ],
      organizationId: '',
    };

    function Consumer() {
      const { organizationId } = useBrand();

      return (
        <span data-testid="organization-id">{organizationId || 'none'}</span>
      );
    }

    const Wrapper = createWrapper();

    render(
      <Wrapper>
        <BrandProvider initialBootstrap={bootstrapWithoutNestedSlug as never}>
          <Consumer />
        </BrandProvider>
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('organization-id')).toHaveTextContent(
        'org_owned',
      );
    });
  });

  it('loads self-hosted brands through local bootstrap without a signed-in session', async () => {
    process.env.NEXT_PUBLIC_BETTER_AUTH_ENABLED = 'false';
    useAuthMock.mockReturnValue({
      getToken: vi.fn().mockResolvedValue(null),
      isLoaded: true,
      isSignedIn: false,
      orgId: null,
      userId: null,
    });
    useUserMock.mockReturnValue({ user: null });
    useParamsMock.mockReturnValue({
      brandSlug: 'default',
      orgSlug: 'default',
    });
    loadClientProtectedBootstrapMock.mockImplementation(
      async (
        _cacheKey: string | undefined,
        getAuthService: () => Promise<unknown>,
      ) => {
        await getAuthService();

        return {
          ...initialBootstrap,
          brandId: 'brand_default',
          brands: [
            {
              id: 'brand_default',
              label: 'Default Brand',
              organization: {
                id: 'org_default',
                slug: 'default',
              },
              slug: 'default',
            },
          ],
          organizationId: 'org_default',
        };
      },
    );

    function Consumer() {
      const { brandId, brands, isReady, organizationId, selectedBrand } =
        useBrand();

      return (
        <div>
          <span data-testid="brand-id">{brandId}</span>
          <span data-testid="organization-id">{organizationId}</span>
          <span data-testid="brand-count">{String(brands.length)}</span>
          <span data-testid="selected-brand">{selectedBrand?.label}</span>
          <span data-testid="is-ready">{String(isReady)}</span>
        </div>
      );
    }

    const Wrapper = createWrapper();

    render(
      <Wrapper>
        <BrandProvider initialBootstrap={null}>
          <Consumer />
        </BrandProvider>
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('brand-id')).toHaveTextContent('brand_default');
      expect(screen.getByTestId('organization-id')).toHaveTextContent(
        'org_default',
      );
      expect(screen.getByTestId('brand-count')).toHaveTextContent('1');
      expect(screen.getByTestId('selected-brand')).toHaveTextContent(
        'Default Brand',
      );
      expect(screen.getByTestId('is-ready')).toHaveTextContent('true');
    });
    expect(authServiceGetInstanceMock).toHaveBeenCalledWith('');
    expect(useAuthedServiceMock).not.toHaveBeenCalled();
  });
});
