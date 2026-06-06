import { useAuth, useUser } from '@clerk/nextjs';
import type {
  IBrand,
  ICredential,
  IDarkroomCapabilities,
  IOrganizationSetting,
} from '@genfeedai/interfaces';
import { Brand } from '@genfeedai/models/organization/brand.model';
import { OrganizationSetting } from '@genfeedai/models/organization/organization-setting.model';
import type { ProtectedBootstrapData } from '@genfeedai/props/layout/protected-bootstrap.props';
import { AuthService } from '@genfeedai/services/auth/auth.service';
import { clearAllServiceInstances } from '@genfeedai/services/core/interceptor.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { OrganizationsService } from '@genfeedai/services/organization/organizations.service';
import { UsersService } from '@genfeedai/services/organization/users.service';
import {
  getClerkPublicData,
  getPlaywrightAuthState,
} from '@helpers/auth/clerk.helper';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { loadClientProtectedBootstrap } from '../../providers/protected-bootstrap/client-protected-bootstrap';
import {
  clearContextTokenCache,
  useContextAuthedService,
} from '../internal/context-authed-service';
import {
  BRAND_CONTEXT_CACHE_TTL_MS,
  getBrandEntityId,
  getBrandOrganizationId,
  getBrandOrganizationSlug,
} from './brand-context.helpers';

interface UseBrandProviderStateParams {
  initialBootstrap?: ProtectedBootstrapData | null;
}

export function useBrandProviderState({
  initialBootstrap = null,
}: UseBrandProviderStateParams) {
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
  const getAuthService = useContextAuthedService((token: string) =>
    AuthService.getInstance(token),
  );

  const sessionKey = `${effectiveUserId ?? 'none'}:${effectiveOrgId ?? 'none'}`;

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
  const clientBootstrapCacheKey = shouldFetchBrands
    ? `protected-bootstrap:${sessionKey}`
    : undefined;

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

  const skipBrandsInitialFetch = initialBrands.length > 0;

  const {
    data: brandsData,
    isLoading: brandsLoading,
    refetch: refetchBrands,
  } = useQuery({
    enabled: shouldFetchBrands,
    initialData: initialBrands.length > 0 ? initialBrands : undefined,
    initialDataUpdatedAt: initialBrands.length > 0 ? 0 : undefined,
    queryFn: async () => {
      if (!shouldFetchBrands) {
        return [];
      }

      try {
        const bootstrap = await loadClientProtectedBootstrap(
          clientBootstrapCacheKey,
          getAuthService,
        );

        if (bootstrap) {
          return bootstrap.brands.map((brand) => new Brand(brand));
        }
      } catch (error) {
        logger.warn('Failed to load client protected bootstrap for brands', {
          error,
          reportToSentry: false,
        });
      }

      const service = await getUsersService();
      const data = await service.findMeBrands({
        pagination: false,
        sort: 'label: 1',
      });

      return data.map((brand: Partial<IBrand>) => new Brand(brand));
    },
    queryKey: ['brand-context-brands', sessionKey],
    staleTime: skipBrandsInitialFetch ? BRAND_CONTEXT_CACHE_TTL_MS : 0,
  });

  const refreshBrands = useCallback(async () => {
    await refetchBrands();
  }, [refetchBrands]);

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
    data: settings = null,
    isLoading: settingsLoading,
    refetch: refetchSettings,
  } = useQuery({
    enabled: shouldFetchSettings && !!scopedOrganizationId,
    initialData: initialSettings ?? undefined,
    initialDataUpdatedAt: initialSettings != null ? 0 : undefined,
    queryFn: async () => {
      if (!shouldFetchSettings || !scopedOrganizationId) {
        return null;
      }

      try {
        const bootstrap = await loadClientProtectedBootstrap(
          clientBootstrapCacheKey,
          getAuthService,
        );

        if (bootstrap?.organizationId === scopedOrganizationId) {
          return bootstrap.settings
            ? new OrganizationSetting(bootstrap.settings)
            : null;
        }
      } catch (error) {
        logger.warn('Failed to load client protected bootstrap for settings', {
          error,
          reportToSentry: false,
        });
      }

      try {
        const service = await getOrganizationsService();
        return await service.getSettings(scopedOrganizationId);
      } catch (error) {
        logger.error('Failed to fetch organization settings', error);
        return null;
      }
    },
    queryKey: ['brand-context-settings', scopedOrganizationId],
    staleTime: BRAND_CONTEXT_CACHE_TTL_MS,
  });

  const refreshSettings = useCallback(async () => {
    await refetchSettings();
  }, [refetchSettings]);

  const {
    data: darkroomCapabilities = null,
    isLoading: darkroomCapabilitiesLoading,
  } = useQuery({
    enabled: shouldFetchDarkroom && !!scopedOrganizationId && !!scopedBrandId,
    initialData: initialDarkroomCapabilities ?? undefined,
    initialDataUpdatedAt: initialDarkroomCapabilities != null ? 0 : undefined,
    queryFn: async () => {
      if (!shouldFetchDarkroom || !scopedOrganizationId || !scopedBrandId) {
        return null;
      }

      try {
        const bootstrap = await loadClientProtectedBootstrap(
          clientBootstrapCacheKey,
          getAuthService,
        );

        if (
          bootstrap?.organizationId === scopedOrganizationId &&
          bootstrap.brandId === scopedBrandId
        ) {
          return bootstrap.darkroomCapabilities;
        }
      } catch (error) {
        logger.warn(
          'Failed to load client protected bootstrap for darkroom capabilities',
          {
            error,
            reportToSentry: false,
          },
        );
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
    queryKey: ['brand-context-darkroom', scopedOrganizationId, scopedBrandId],
    staleTime: BRAND_CONTEXT_CACHE_TTL_MS,
  });

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

  return {
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
  };
}
