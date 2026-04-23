import { useAuth, useUser } from '@clerk/nextjs';
import type {
  IBrand,
  ICredential,
  IDarkroomCapabilities,
  IOrganizationSetting,
} from '@genfeedai/interfaces';
import { Brand } from '@genfeedai/models/organization/brand.model';
import { OrganizationSetting } from '@genfeedai/models/organization/organization-setting.model';
import type { LayoutProps } from '@genfeedai/props/layout/layout.props';
import type { ProtectedBootstrapData } from '@genfeedai/props/layout/protected-bootstrap.props';
import { clearAllServiceInstances } from '@genfeedai/services/core/interceptor.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { OrganizationsService } from '@genfeedai/services/organization/organizations.service';
import { UsersService } from '@genfeedai/services/organization/users.service';
import {
  getClerkPublicData,
  getPlaywrightAuthState,
} from '@helpers/auth/clerk.helper';
import { useParams } from 'next/navigation';
import {
  createContext,
  type PropsWithChildren,
  startTransition,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  clearContextTokenCache,
  useContextAuthedService,
} from '../internal/context-authed-service';
import { useContextResource } from '../internal/context-resource';

export interface BrandContextType {
  brands: Brand[];
  brandId: string;
  setBrandId: (id: string) => void;
  organizationId: string;
  setOrganizationId: (id: string) => void;
  selectedBrand: Brand | undefined;
  credentials: ICredential[];
  refreshBrands: () => Promise<void>;
  /** True when auth is loaded and brandId/organizationId are available */
  isReady: boolean;
  /** Organization settings - fetched once, shared across all components */
  settings: IOrganizationSetting | null;
  /** True when settings are being loaded */
  settingsLoading: boolean;
  /** Refresh organization settings */
  refreshSettings: () => Promise<void>;
  /** Brand-scoped darkroom capability state */
  darkroomCapabilities: IDarkroomCapabilities | null;
  darkroomCapabilitiesLoading: boolean;
}

const BrandContext = createContext<BrandContextType | undefined>(undefined);

interface BrandProviderProps extends PropsWithChildren<LayoutProps> {
  initialBootstrap?: ProtectedBootstrapData | null;
}

function getBrandEntityId(brand: IBrand | null | undefined): string {
  if (typeof brand?.id === 'string') {
    return brand.id;
  }

  const brandWithMongoId = brand as unknown as { _id?: unknown } | null;

  if (typeof brandWithMongoId?._id === 'string') {
    return brandWithMongoId._id;
  }

  return '';
}

function getBrandOrganizationId(brand: IBrand | null | undefined): string {
  const organization = brand?.organization;

  if (typeof organization === 'string') {
    return organization;
  }

  if (
    organization &&
    typeof organization === 'object' &&
    'id' in organization &&
    typeof organization.id === 'string'
  ) {
    return organization.id;
  }

  if (
    organization &&
    typeof organization === 'object' &&
    '_id' in organization &&
    typeof organization._id === 'string'
  ) {
    return organization._id;
  }

  return '';
}

function getBrandOrganizationSlug(brand: IBrand | null | undefined): string {
  const organization = brand?.organization;

  if (
    organization &&
    typeof organization === 'object' &&
    'slug' in organization &&
    typeof organization.slug === 'string'
  ) {
    return organization.slug;
  }

  return '';
}

export function BrandProvider({
  children,
  initialBootstrap = null,
}: BrandProviderProps) {
  const params = useParams<{ brandSlug?: string; orgSlug?: string }>();
  const { isLoaded: isAuthLoaded, isSignedIn, userId, orgId } = useAuth();
  const { user } = useUser();
  const playwrightAuth = getPlaywrightAuthState();
  const effectiveIsAuthLoaded =
    isAuthLoaded || playwrightAuth?.isLoaded === true;
  const effectiveIsSignedIn = isSignedIn || playwrightAuth?.isSignedIn === true;
  const effectiveUserId = userId ?? playwrightAuth?.userId ?? null;
  const effectiveOrgId = orgId ?? playwrightAuth?.orgId ?? null;

  const getUsersService = useContextAuthedService((token: string) =>
    UsersService.getInstance(token),
  );

  const getOrganizationsService = useContextAuthedService((token: string) =>
    OrganizationsService.getInstance(token),
  );

  const sessionKey = useMemo(
    () => `${effectiveUserId ?? 'none'}:${effectiveOrgId ?? 'none'}`,
    [effectiveUserId, effectiveOrgId],
  );

  const clerkData = useMemo(() => {
    if (user) {
      return getClerkPublicData(user);
    }

    return playwrightAuth?.publicMetadata ?? { brand: '', organization: '' };
  }, [playwrightAuth?.publicMetadata, user]);

  const initialBrands = useMemo(
    () => (initialBootstrap?.brands ?? []).map((brand) => new Brand(brand)),
    [initialBootstrap?.brands],
  );
  const initialBrandId = initialBootstrap?.brandId ?? '';
  const initialOrganizationId = initialBootstrap?.organizationId ?? '';
  const initialSettings = useMemo(
    () =>
      initialBootstrap?.settings
        ? new OrganizationSetting(initialBootstrap.settings)
        : null,
    [initialBootstrap?.settings],
  );
  const initialDarkroomCapabilities =
    initialBootstrap?.darkroomCapabilities ?? null;

  const [brandId, setBrandId] = useState(initialBrandId || clerkData.brand);
  const [organizationId, setOrganizationId] = useState(
    initialOrganizationId || clerkData.organization || effectiveOrgId || '',
  );
  const shouldFetchBrands = effectiveIsAuthLoaded && effectiveIsSignedIn;

  useEffect(() => {
    const resolvedOrganizationId =
      initialOrganizationId || clerkData.organization || effectiveOrgId || '';
    const resolvedBrandId = initialBrandId || clerkData.brand;

    startTransition(() => {
      setOrganizationId((previousOrganizationId: string) =>
        resolvedOrganizationId &&
        resolvedOrganizationId !== previousOrganizationId
          ? resolvedOrganizationId
          : previousOrganizationId,
      );

      setBrandId((previousBrandId: string) =>
        resolvedBrandId && resolvedBrandId !== previousBrandId
          ? resolvedBrandId
          : previousBrandId,
      );
    });
  }, [
    initialOrganizationId,
    initialBrandId,
    clerkData.organization,
    clerkData.brand,
    effectiveOrgId,
  ]);

  const {
    data: brandsData,
    isLoading: brandsLoading,
    refresh: refreshBrands,
  } = useContextResource(
    async () => {
      if (!shouldFetchBrands) {
        return [];
      }

      const service = await getUsersService();
      const data = await service.findMeBrands({
        pagination: false,
        sort: 'label: 1',
      });

      return data.map((brand: Partial<IBrand>) => new Brand(brand));
    },
    {
      dependencies: [effectiveIsAuthLoaded, effectiveIsSignedIn, sessionKey],
      enabled: shouldFetchBrands,
      initialData: initialBrands,
      revalidateOnMount: initialBrands.length === 0,
    },
  );

  const brands = useMemo(() => brandsData ?? [], [brandsData]);
  const routeOrgSlug =
    typeof params?.orgSlug === 'string' ? params.orgSlug : '';
  const routeBrandSlug =
    typeof params?.brandSlug === 'string' ? params.brandSlug : '';
  const isOrgRoute = routeOrgSlug.length > 0 && routeBrandSlug.length === 0;
  const selectedBrand = useMemo(
    () => brands.find((brand: Brand) => getBrandEntityId(brand) === brandId),
    [brands, brandId],
  );

  const routeOrganizationBrand = useMemo(() => {
    if (!routeOrgSlug || routeBrandSlug || brands.length === 0) {
      return undefined;
    }

    return (
      (selectedBrand && getBrandOrganizationSlug(selectedBrand) === routeOrgSlug
        ? selectedBrand
        : undefined) ??
      brands.find((brand) => getBrandOrganizationSlug(brand) === routeOrgSlug)
    );
  }, [brands, routeBrandSlug, routeOrgSlug, selectedBrand]);

  const routeBrand = useMemo(() => {
    if (!routeOrgSlug || !routeBrandSlug || brands.length === 0) {
      return undefined;
    }

    return (
      (selectedBrand &&
      getBrandOrganizationSlug(selectedBrand) === routeOrgSlug &&
      selectedBrand.slug === routeBrandSlug
        ? selectedBrand
        : undefined) ??
      brands.find((brand) => {
        if (getBrandOrganizationSlug(brand) !== routeOrgSlug) {
          return false;
        }

        return brand.slug === routeBrandSlug;
      })
    );
  }, [brands, routeBrandSlug, routeOrgSlug, selectedBrand]);

  const effectiveSelectedBrand = useMemo(() => {
    if (routeBrand) {
      return routeBrand;
    }

    if (selectedBrand) {
      return selectedBrand;
    }

    if (!isOrgRoute && brands.length > 0) {
      return brands[0];
    }

    return undefined;
  }, [brands, isOrgRoute, routeBrand, selectedBrand]);

  const effectiveBrandId = useMemo(() => {
    if (isOrgRoute) {
      return '';
    }

    return getBrandEntityId(effectiveSelectedBrand) || brandId;
  }, [brandId, effectiveSelectedBrand, isOrgRoute]);

  const effectiveOrganizationId = useMemo(() => {
    if (routeOrganizationBrand) {
      return getBrandOrganizationId(routeOrganizationBrand) || organizationId;
    }

    if (routeBrand) {
      return getBrandOrganizationId(routeBrand) || organizationId;
    }

    if (effectiveSelectedBrand) {
      return getBrandOrganizationId(effectiveSelectedBrand) || organizationId;
    }

    return organizationId;
  }, [
    effectiveSelectedBrand,
    organizationId,
    routeBrand,
    routeOrganizationBrand,
  ]);

  const isScopeReady = initialBrands.length > 0 || !brandsLoading;
  const scopedBrandId = isScopeReady ? effectiveBrandId : '';
  const scopedOrganizationId = isScopeReady ? effectiveOrganizationId : '';
  const shouldFetchSettings =
    effectiveIsAuthLoaded && effectiveIsSignedIn && !!scopedOrganizationId;
  const shouldFetchDarkroom =
    effectiveIsAuthLoaded &&
    effectiveIsSignedIn &&
    !!scopedOrganizationId &&
    !!scopedBrandId;

  const {
    data: settings,
    isLoading: settingsLoading,
    refresh: refreshSettings,
  } = useContextResource(
    async () => {
      if (!shouldFetchSettings || !scopedOrganizationId) {
        return null;
      }

      try {
        const service = await getOrganizationsService();
        return await service.getSettings(scopedOrganizationId);
      } catch (error) {
        logger.error('Failed to fetch organization settings', error);
        return null;
      }
    },
    {
      dependencies: [scopedOrganizationId],
      enabled: shouldFetchSettings && !!scopedOrganizationId,
      initialData: initialSettings,
      revalidateOnMount: initialSettings == null,
    },
  );

  const { data: darkroomCapabilities, isLoading: darkroomCapabilitiesLoading } =
    useContextResource(
      async () => {
        if (!shouldFetchDarkroom || !scopedOrganizationId || !scopedBrandId) {
          return null;
        }

        try {
          const service = await getOrganizationsService();
          return await service.getDarkroomCapabilities(
            scopedOrganizationId,
            scopedBrandId,
          );
        } catch (error) {
          logger.error('Failed to fetch darkroom capabilities', error);
          return null;
        }
      },
      {
        dependencies: [scopedOrganizationId, scopedBrandId],
        enabled:
          shouldFetchDarkroom && !!scopedOrganizationId && !!scopedBrandId,
        initialData: initialDarkroomCapabilities,
        revalidateOnMount: initialDarkroomCapabilities == null,
      },
    );

  useEffect(() => {
    if (effectiveIsAuthLoaded && !effectiveIsSignedIn) {
      clearContextTokenCache();
      clearAllServiceInstances();
      startTransition(() => {
        setBrandId('');
        setOrganizationId('');
      });
    }
  }, [effectiveIsAuthLoaded, effectiveIsSignedIn]);

  useEffect(() => {
    if (!isScopeReady) {
      return;
    }

    if (scopedBrandId === brandId && scopedOrganizationId === organizationId) {
      return;
    }

    startTransition(() => {
      if (scopedBrandId !== brandId) {
        setBrandId(scopedBrandId);
      }

      if (scopedOrganizationId !== organizationId) {
        setOrganizationId(scopedOrganizationId);
      }
    });
  }, [
    brandId,
    isScopeReady,
    organizationId,
    scopedBrandId,
    scopedOrganizationId,
  ]);

  const credentials = useMemo<ICredential[]>(
    () =>
      effectiveSelectedBrand &&
      Array.isArray(effectiveSelectedBrand.credentials)
        ? effectiveSelectedBrand.credentials
        : [],
    [effectiveSelectedBrand],
  );

  const isReady = useMemo(
    () =>
      effectiveIsAuthLoaded &&
      effectiveIsSignedIn &&
      !!scopedOrganizationId &&
      (isOrgRoute || !!scopedBrandId),
    [
      effectiveIsAuthLoaded,
      effectiveIsSignedIn,
      isOrgRoute,
      scopedBrandId,
      scopedOrganizationId,
    ],
  );

  const contextValue = useMemo<BrandContextType>(
    () => ({
      brandId: scopedBrandId,
      brands,
      credentials,
      darkroomCapabilities,
      darkroomCapabilitiesLoading,
      isReady,
      organizationId: scopedOrganizationId,
      refreshBrands,
      refreshSettings,
      selectedBrand: effectiveSelectedBrand,
      setBrandId,
      setOrganizationId,
      settings,
      settingsLoading,
    }),
    [
      brands,
      credentials,
      darkroomCapabilities,
      darkroomCapabilitiesLoading,
      effectiveSelectedBrand,
      isReady,
      refreshBrands,
      refreshSettings,
      scopedBrandId,
      scopedOrganizationId,
      settings,
      settingsLoading,
    ],
  );

  return (
    <BrandContext.Provider value={contextValue}>
      {children}
    </BrandContext.Provider>
  );
}

const DEFAULT_BRAND_CONTEXT: BrandContextType = {
  brandId: '',
  brands: [],
  credentials: [],
  darkroomCapabilities: null,
  darkroomCapabilitiesLoading: false,
  isReady: false,
  organizationId: '',
  refreshBrands: async () => {
    /* noop */
  },
  refreshSettings: async () => {
    /* noop */
  },
  selectedBrand: undefined,
  setBrandId: () => {
    /* noop */
  },
  setOrganizationId: () => {
    /* noop */
  },
  settings: null,
  settingsLoading: false,
};

export function useBrand(): BrandContextType {
  return useContext(BrandContext) ?? DEFAULT_BRAND_CONTEXT;
}

/** Use when you only need the brand ID — won't re-render on other changes */
export function useBrandId(): string {
  return useBrand().brandId;
}
