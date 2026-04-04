import { useAuth, useUser } from '@clerk/nextjs';
import type {
  IBrand,
  ICredential,
  IDarkroomCapabilities,
  IOrganizationSetting,
} from '@genfeedai/interfaces';
import {
  getClerkPublicData,
  getPlaywrightAuthState,
} from '@helpers/auth/clerk.helper';
import {
  clearTokenCache,
  useAuthedService,
} from '@hooks/auth/use-authed-service/use-authed-service';
import { useResource } from '@hooks/data/resource/use-resource/use-resource';
import { Brand } from '@models/organization/brand.model';
import { OrganizationSetting } from '@models/organization/organization-setting.model';
import type { LayoutProps } from '@props/layout/layout.props';
import type { ProtectedBootstrapData } from '@props/layout/protected-bootstrap.props';
import { clearAllServiceInstances } from '@services/core/interceptor.service';
import { logger } from '@services/core/logger.service';
import { OrganizationsService } from '@services/organization/organizations.service';
import { UsersService } from '@services/organization/users.service';
import {
  createContext,
  startTransition,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

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

interface BrandProviderProps extends LayoutProps {
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

  const getUsersService = useAuthedService((token: string) =>
    UsersService.getInstance(token),
  );

  const getOrganizationsService = useAuthedService((token: string) =>
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

  const { data: brandsData, refresh: refreshBrands } = useResource(
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
  } = useResource(
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
    useResource(
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
      clearTokenCache();
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
    () => brands.find((b) => b.id === brandId),
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

/** Use when you only need stable action functions */
export function useBrandActions() {
  const { refreshBrands, refreshSettings, setBrandId, setOrganizationId } =
    useBrand();
  return useMemo(
    () => ({ refreshBrands, refreshSettings, setBrandId, setOrganizationId }),
    [refreshBrands, refreshSettings, setBrandId, setOrganizationId],
  );
}

/** Use when you only need the selected brand */
export function useSelectedBrand(): Brand | undefined {
  return useBrand().selectedBrand;
}
