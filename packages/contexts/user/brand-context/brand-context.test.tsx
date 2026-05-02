// @vitest-environment jsdom
'use client';

import {
  BrandProvider,
  useBrand,
} from '@genfeedai/contexts/user/brand-context/brand-context';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useAuthMock = vi.fn();
const useParamsMock = vi.fn();
const useUserMock = vi.fn();
const useAuthedServiceMock = vi.fn();
const useResourceMock = vi.fn(() => ({
  data: null,
  error: null,
  isLoading: false,
  mutate: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => useAuthMock(),
  useUser: () => useUserMock(),
}));

vi.mock('next/navigation', () => ({
  useParams: () => useParamsMock(),
}));

vi.mock('@genfeedai/hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => useAuthedServiceMock,
}));

vi.mock('../internal/context-resource', () => ({
  useContextResource: (...args: unknown[]) => useResourceMock(...args),
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
      userId: 'clerk_123',
    });
    useUserMock.mockReturnValue({
      user: {
        publicMetadata: {
          brand: 'brand_123',
          organization: 'org_123',
        },
      },
    });
    useResourceMock.mockImplementation(
      (_fetcher: unknown, options?: Record<string, unknown>) => ({
        data: options?.initialData ?? null,
        isLoading: false,
        refresh: vi.fn().mockResolvedValue(undefined),
      }),
    );
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

    render(
      <BrandProvider initialBootstrap={initialBootstrap as never}>
        <Consumer />
      </BrandProvider>,
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

  it('passes bootstrap data into the resource hooks so mount does not refetch brands or settings', () => {
    render(
      <BrandProvider initialBootstrap={initialBootstrap as never}>
        <div>child</div>
      </BrandProvider>,
    );

    expect(useResourceMock).toHaveBeenNthCalledWith(
      1,
      expect.any(Function),
      expect.objectContaining({
        initialData: expect.any(Array),
        revalidateOnMount: false,
      }),
    );
    expect(useResourceMock).toHaveBeenNthCalledWith(
      2,
      expect.any(Function),
      expect.objectContaining({
        enabled: true,
        initialData: expect.objectContaining({
          enabledModels: ['507f1f77bcf86cd799439011'],
          organization: 'org_123',
        }),
        revalidateOnMount: false,
      }),
    );
    expect(useResourceMock).toHaveBeenNthCalledWith(
      3,
      expect.any(Function),
      expect.objectContaining({
        enabled: true,
        initialData: initialBootstrap.darkroomCapabilities,
        revalidateOnMount: false,
      }),
    );
    expect(useAuthedServiceMock).not.toHaveBeenCalled();
  });

  it('disables brand-scoped resource hooks until auth is ready', () => {
    useAuthMock.mockReturnValue({
      isLoaded: false,
      isSignedIn: false,
      orgId: null,
      userId: null,
    });

    render(
      <BrandProvider initialBootstrap={null}>
        <div>child</div>
      </BrandProvider>,
    );

    expect(useResourceMock).toHaveBeenNthCalledWith(
      1,
      expect.any(Function),
      expect.objectContaining({
        enabled: false,
      }),
    );
    expect(useResourceMock).toHaveBeenNthCalledWith(
      2,
      expect.any(Function),
      expect.objectContaining({
        enabled: false,
      }),
    );
    expect(useResourceMock).toHaveBeenNthCalledWith(
      3,
      expect.any(Function),
      expect.objectContaining({
        enabled: false,
      }),
    );
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

    render(
      <BrandProvider initialBootstrap={crossOrgBootstrap as never}>
        <Consumer />
      </BrandProvider>,
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

    render(
      <BrandProvider initialBootstrap={orgScopedBootstrap as never}>
        <Consumer />
      </BrandProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('brand-id')).toHaveTextContent('');
      expect(screen.getByTestId('organization-id')).toHaveTextContent(
        'org_route',
      );
      expect(screen.getByTestId('is-ready')).toHaveTextContent('true');
    });
  });

  it('reconciles stale Clerk ids against the fetched brand scope before exposing context', async () => {
    const fetchedBrands = [
      {
        id: 'brand_current',
        label: 'Current Brand',
        organization: {
          id: 'org_current',
          slug: 'current-org',
        },
        slug: 'current-brand',
      },
    ];

    useUserMock.mockReturnValue({
      user: {
        publicMetadata: {
          brand: 'brand_old',
          organization: 'org_old',
        },
      },
    });

    useResourceMock.mockImplementation(
      (_fetcher: unknown, options?: Record<string, unknown>) => ({
        data: Array.isArray(options?.initialData)
          ? fetchedBrands
          : (options?.initialData ?? null),
        isLoading: false,
        refresh: vi.fn().mockResolvedValue(undefined),
      }),
    );

    function Consumer() {
      const { brandId, organizationId, selectedBrand } = useBrand();

      return (
        <div>
          <span data-testid="brand-id">{brandId}</span>
          <span data-testid="organization-id">{organizationId}</span>
          <span data-testid="selected-brand">
            {selectedBrand?.label ?? 'none'}
          </span>
        </div>
      );
    }

    render(
      <BrandProvider initialBootstrap={null}>
        <Consumer />
      </BrandProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('brand-id')).toHaveTextContent('brand_current');
      expect(screen.getByTestId('organization-id')).toHaveTextContent(
        'org_current',
      );
      expect(screen.getByTestId('selected-brand')).toHaveTextContent(
        'Current Brand',
      );
    });
  });
});
