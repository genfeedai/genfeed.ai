// @vitest-environment jsdom
'use client';

import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useAuthMock = vi.fn();
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

vi.mock('@genfeedai/services/core/interceptor.service', () => ({
  clearAllServiceInstances: vi.fn(),
}));

describe('BrandProvider', () => {
  let BrandProvider: typeof import('@genfeedai/contexts/user/brand-context/brand-context').BrandProvider;
  let useBrand: typeof import('@genfeedai/contexts/user/brand-context/brand-context').useBrand;

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

  beforeEach(async () => {
    vi.clearAllMocks();
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

    const module = await import(
      '@genfeedai/contexts/user/brand-context/brand-context'
    );
    BrandProvider = module.BrandProvider;
    useBrand = module.useBrand;
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
});
