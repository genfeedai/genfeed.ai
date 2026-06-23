// @vitest-environment jsdom
'use client';

import {
  BrandProvider,
  useBrand,
} from '@genfeedai/contexts/user/brand-context/brand-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useAuthMock = vi.fn();
const useParamsMock = vi.fn();
const useUserMock = vi.fn();
const useAuthedServiceMock = vi.fn();

vi.mock('@genfeedai/auth-client/react', () => ({
  useAuth: () => useAuthMock(),
  useUser: () => useUserMock(),
}));

vi.mock('next/navigation', () => ({
  useParams: () => useParamsMock(),
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
    getInstance: vi.fn(),
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

vi.mock(
  '../../providers/protected-bootstrap/client-protected-bootstrap',
  () => ({
    loadClientProtectedBootstrap: vi.fn().mockResolvedValue(null),
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
    darkroomCapabilities: {
      brandEnabled: true,
      brandId: 'brand_123',
      fleet: {
        images: true,
        llm: true,
        videos: true,
        voices: true,
      },
      id: 'darkroom-capabilities:org_123:brand_123',
      organizationId: 'org_123',
    },
    organizationId: 'org_123',
    settings: {
      enabledModels: [
        {
          buffer: [
            0x50, 0x7f, 0x1f, 0x77, 0xbc, 0xf8, 0x6c, 0xd7, 0x99, 0x43, 0x90,
            0x11,
          ],
        },
      ],
      organization: 'org_123',
    },
    streak: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    useParamsMock.mockReturnValue({});
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

  it('hydrates brand, settings, and darkroom state from the bootstrap payload', () => {
    function Consumer() {
      const {
        brandId,
        brands,
        darkroomCapabilities,
        organizationId,
        settings,
      } = useBrand();

      return (
        <div>
          <span data-testid="brand-id">{brandId}</span>
          <span data-testid="organization-id">{organizationId}</span>
          <span data-testid="brand-count">{String(brands.length)}</span>
          <span data-testid="enabled-models">
            {String(settings?.enabledModels?.length ?? 0)}
          </span>
          <span data-testid="enabled-model-id">
            {String(settings?.enabledModels?.[0] ?? '')}
          </span>
          <span data-testid="darkroom-brand-enabled">
            {String(darkroomCapabilities?.brandEnabled)}
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
      '507f1f77bcf86cd799439011',
    );
    expect(screen.getByTestId('darkroom-brand-enabled')).toHaveTextContent(
      'true',
    );
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
      darkroomCapabilities: null,
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
});
