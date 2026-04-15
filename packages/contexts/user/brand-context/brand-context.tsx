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

export function BrandProvider({
  children,
  initialBootstrap = null,
}: BrandProviderProps) {
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
  const shouldFetchSettings =
    effectiveIsAuthLoaded && effectiveIsSignedIn && !!organizationId;
  const shouldFetchDarkroom =
    effectiveIsAuthLoaded &&
    effectiveIsSignedIn &&
    !!organizationId &&
    !!brandId;

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

  const { data: brandsData, refresh: refreshBrands } = useContextResource(
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

  const {
    data: settings,
    isLoading: settingsLoading,
    refresh: refreshSettings,
  } = useContextResource(
    async () => {
      if (!shouldFetchSettings) {
        return null;
      }

      try {
        const service = await getOrganizationsService();
        return await service.getSettings(organizationId);
      } catch (error) {
        logger.error('Failed to fetch organization settings', error);
        return null;
      }
    },
    {
      dependencies: [organizationId],
      enabled: shouldFetchSettings,
      initialData: initialSettings,
      revalidateOnMount: initialSettings == null,
    },
  );

  const { data: darkroomCapabilities, isLoading: darkroomCapabilitiesLoading } =
    useContextResource(
      async () => {
        if (!shouldFetchDarkroom) {
          return null;
        }

        try {
          const service = await getOrganizationsService();
          return await service.getDarkroomCapabilities(organizationId, brandId);
        } catch (error) {
          logger.error('Failed to fetch darkroom capabilities', error);
          return null;
        }
      },
      {
        dependencies: [organizationId, brandId],
        enabled: shouldFetchDarkroom,
        initialData: initialDarkroomCapabilities,
        revalidateOnMount: initialDarkroomCapabilities == null,
      },
    );

  const brands = useMemo(() => brandsData ?? [], [brandsData]);

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
    if (!brandId && brands.length > 0 && brandsData) {
      const firstBrand = brands[0];
      startTransition(() => {
        setBrandId(firstBrand.id);
      });
    }
  }, [brandsData, brandId, brands.length, brands[0]]);

  const selectedBrand = useMemo(
    () => brands.find((brand: Brand) => brand.id === brandId),
    [brands, brandId],
  );

  const credentials = useMemo<ICredential[]>(
    () =>
      selectedBrand && Array.isArray(selectedBrand.credentials)
        ? selectedBrand.credentials
        : [],
    [selectedBrand],
  );

  const isReady = useMemo(
    () =>
      effectiveIsAuthLoaded &&
      effectiveIsSignedIn &&
      !!brandId &&
      !!organizationId,
    [effectiveIsAuthLoaded, effectiveIsSignedIn, brandId, organizationId],
  );

  const contextValue = useMemo<BrandContextType>(
    () => ({
      brandId,
      brands,
      credentials,
      darkroomCapabilities,
      darkroomCapabilitiesLoading,
      isReady,
      organizationId,
      refreshBrands,
      refreshSettings,
      selectedBrand,
      setBrandId,
      setOrganizationId,
      settings,
      settingsLoading,
    }),
    [
      brandId,
      brands,
      credentials,
      darkroomCapabilities,
      darkroomCapabilitiesLoading,
      isReady,
      organizationId,
      refreshBrands,
      refreshSettings,
      selectedBrand,
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
