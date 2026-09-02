import { isBetterAuthEnabled } from '@genfeedai/auth-client';
import { isSelfHostedDeployment } from '@genfeedai/config/deployment';
import { parseScopedAppPath } from '@genfeedai/contracts/constants';
import type { IBrand, ICredential } from '@genfeedai/contracts/interfaces';
import { useAuthIdentity } from '@genfeedai/hooks/auth/use-auth-identity/use-auth-identity';
import { useAuthUser } from '@genfeedai/hooks/auth/use-auth-user/use-auth-user';
import { Brand } from '@genfeedai/models/organization/brand.model';
import { OrganizationSetting } from '@genfeedai/models/organization/organization-setting.model';
import type { ProtectedBootstrapData } from '@genfeedai/props/layout/protected-bootstrap.props';
import { AuthService } from '@genfeedai/services/auth/auth.service';
import { clearAllServiceInstances } from '@genfeedai/services/core/interceptor.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { OrganizationsService } from '@genfeedai/services/organization/organizations.service';
import { UsersService } from '@genfeedai/services/organization/users.service';
import {
  getAuthPublicData,
  getPlaywrightAuthState,
} from '@helpers/auth/auth.helper';
import { useQuery } from '@tanstack/react-query';
import { useParams, usePathname } from 'next/navigation';
import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  clearClientProtectedBootstrapCache,
  loadClientProtectedBootstrap,
} from '../../providers/protected-bootstrap/client-protected-bootstrap';
import { useContextAuthedService } from '../internal/context-authed-service';
import {
  BRAND_CONTEXT_CACHE_TTL_MS,
  getBrandEntityId,
  getBrandOrganizationId,
  getBrandOrganizationSlug,
} from './brand-context.helpers';

function isLocalBootstrapEnabled(): boolean {
  return isSelfHostedDeployment() && !isBetterAuthEnabled();
}

interface UseBrandProviderStateParams {
  initialBootstrap?: ProtectedBootstrapData | null;
}

export function useBrandProviderState({
  initialBootstrap = null,
}: UseBrandProviderStateParams) {
  const params = useParams<{ brandSlug?: string; orgSlug?: string }>();
  const pathname = usePathname();
  const pathScope = parseScopedAppPath(pathname ?? '');
  const {
    isLoaded: isAuthLoaded,
    isSignedIn,
    userId,
    orgId,
  } = useAuthIdentity();
  const localBootstrapEnabled = isLocalBootstrapEnabled();
  const { user } = useAuthUser();
  const playwrightAuth = getPlaywrightAuthState();
  const effectiveIsAuthLoaded =
    isAuthLoaded || playwrightAuth?.isLoaded === true || localBootstrapEnabled;
  const effectiveIsSignedIn =
    isSignedIn || playwrightAuth?.isSignedIn === true || localBootstrapEnabled;
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
  const getLocalAuthService = useCallback(
    async () => AuthService.getInstance(''),
    [],
  );

  const sessionKey = `${effectiveUserId ?? 'none'}:${effectiveOrgId ?? 'none'}`;

  const authData = useMemo(() => {
    if (user) {
      return getAuthPublicData(user);
    }

    return playwrightAuth?.publicMetadata ?? { brand: '', organization: '' };
  }, [playwrightAuth?.publicMetadata, user]);

  const initialBrands = useMemo(
    () => (initialBootstrap?.brands ?? []).map((brand) => new Brand(brand)),
    [initialBootstrap?.brands],
  );
  const hasInitialBootstrap = initialBootstrap != null;
  const initialBrandId = initialBootstrap?.brandId ?? '';
  const initialOrganizationId = initialBootstrap?.organizationId ?? '';
  const initialSettings = useMemo(
    () =>
      initialBootstrap?.settings
        ? new OrganizationSetting(initialBootstrap.settings)
        : null,
    [initialBootstrap?.settings],
  );
  const initialFleetCapabilities = initialBootstrap?.fleetCapabilities ?? null;
  const initialDataUpdatedAt = useMemo(() => Date.now(), []);

  const [brandId, setBrandId] = useState(
    hasInitialBootstrap ? initialBrandId : initialBrandId || authData.brand,
  );
  const [organizationId, setOrganizationId] = useState(
    hasInitialBootstrap
      ? initialOrganizationId
      : initialOrganizationId || authData.organization || effectiveOrgId || '',
  );
  const isBrandsFetchEnabled = effectiveIsAuthLoaded && effectiveIsSignedIn;
  const clientBootstrapCacheKey = isBrandsFetchEnabled
    ? `protected-bootstrap:${sessionKey}`
    : undefined;

  useEffect(() => {
    const resolvedOrganizationId = hasInitialBootstrap
      ? initialOrganizationId
      : initialOrganizationId || authData.organization || effectiveOrgId || '';
    const resolvedBrandId = hasInitialBootstrap
      ? initialBrandId
      : initialBrandId || authData.brand;

    startTransition(() => {
      setOrganizationId((previousOrganizationId: string) =>
        (hasInitialBootstrap || resolvedOrganizationId) &&
        resolvedOrganizationId !== previousOrganizationId
          ? resolvedOrganizationId
          : previousOrganizationId,
      );

      setBrandId((previousBrandId: string) =>
        (hasInitialBootstrap || resolvedBrandId) &&
        resolvedBrandId !== previousBrandId
          ? resolvedBrandId
          : previousBrandId,
      );
    });
  }, [
    initialOrganizationId,
    initialBrandId,
    authData.organization,
    authData.brand,
    effectiveOrgId,
    hasInitialBootstrap,
  ]);

  const hasHydratedBootstrapBrands = hasInitialBootstrap;

  const {
    data: brandsData,
    error: credentialsError,
    isFetched: isBrandsFetched,
    isFetching: credentialsLoading,
    isLoading: brandsLoading,
    refetch: refetchBrands,
  } = useQuery({
    enabled: isBrandsFetchEnabled,
    initialData: hasInitialBootstrap ? initialBrands : undefined,
    initialDataUpdatedAt: hasInitialBootstrap
      ? initialDataUpdatedAt
      : undefined,
    queryFn: async () => {
      if (!isBrandsFetchEnabled) {
        return [];
      }

      try {
        const bootstrap = await loadClientProtectedBootstrap(
          clientBootstrapCacheKey,
          localBootstrapEnabled ? getLocalAuthService : getAuthService,
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

      if (localBootstrapEnabled) {
        return [];
      }

      const service = await getUsersService();
      const data = await service.findAllMeBrands({
        sort: 'label: 1',
      });

      return data.map((brand: Partial<IBrand>) => new Brand(brand));
    },
    queryKey: ['brand-context-brands', sessionKey],
    staleTime: hasHydratedBootstrapBrands ? BRAND_CONTEXT_CACHE_TTL_MS : 0,
  });

  const refreshBrands = useCallback(async () => {
    // Brand create/update/delete must not re-serve the 60s client bootstrap
    // snapshot — that is what made the switcher need a hard page refresh.
    clearClientProtectedBootstrapCache();
    await refetchBrands();
  }, [refetchBrands]);

  const brands = useMemo(() => brandsData ?? [], [brandsData]);
  const routeOrgSlug =
    (typeof params?.orgSlug === 'string' ? params.orgSlug : '') ||
    pathScope.orgSlug;
  const routeBrandSlug =
    typeof params?.brandSlug === 'string'
      ? params.brandSlug
      : pathScope.brandSlug;
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

  const hasResolvedBrandList =
    hasInitialBootstrap || isBrandsFetched || !isBrandsFetchEnabled;

  const effectiveSelectedBrand = useMemo(() => {
    if (routeBrand) {
      return routeBrand;
    }

    // URL names a brand. Do not flash JWT / first-brand (Boxing Couple, Koro)
    // while the brand list is still loading or the URL brand has not matched.
    if (routeOrgSlug && routeBrandSlug && !hasResolvedBrandList) {
      return undefined;
    }

    if (selectedBrand) {
      return selectedBrand;
    }

    if (!isOrgRoute && brands.length > 0) {
      return brands[0];
    }

    return undefined;
  }, [
    brands,
    hasResolvedBrandList,
    isOrgRoute,
    routeBrand,
    routeBrandSlug,
    routeOrgSlug,
    selectedBrand,
  ]);

  const effectiveBrandId = useMemo(() => {
    if (isOrgRoute) {
      return '';
    }

    if (routeOrgSlug && routeBrandSlug && !routeBrand) {
      return getBrandEntityId(effectiveSelectedBrand);
    }

    return getBrandEntityId(effectiveSelectedBrand) || brandId;
  }, [
    brandId,
    effectiveSelectedBrand,
    isOrgRoute,
    routeBrand,
    routeBrandSlug,
    routeOrgSlug,
  ]);

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

    if (organizationId) {
      return organizationId;
    }

    const fallbackBrand = brands[0];
    return fallbackBrand ? getBrandOrganizationId(fallbackBrand) : '';
  }, [
    brands,
    effectiveSelectedBrand,
    organizationId,
    routeBrand,
    routeOrganizationBrand,
  ]);

  const isScopeReady = initialBrands.length > 0 || !brandsLoading;
  // `isScopeReady` only says the scope ids are safe to read. It is derived from
  // react-query `isLoading`, which is still false in the render between the
  // query becoming enabled and its first fetch starting — so an empty `brands`
  // array there means "not resolved yet", not "no brands". Consumers that
  // authorize against the brand list (agent workspace bootstrap, #2702) must
  // wait for a settled fetch, a hydrated bootstrap payload, or a session that
  // can never fetch at all.
  const isBrandScopeResolved =
    isScopeReady &&
    (hasInitialBootstrap || isBrandsFetched || !isBrandsFetchEnabled);
  const scopedBrandId = isScopeReady ? effectiveBrandId : '';
  const scopedOrganizationId = isScopeReady ? effectiveOrganizationId : '';
  const shouldFetchSettings =
    effectiveIsAuthLoaded && effectiveIsSignedIn && !!scopedOrganizationId;
  const shouldFetchFleet =
    effectiveIsAuthLoaded &&
    effectiveIsSignedIn &&
    !!scopedOrganizationId &&
    !!scopedBrandId &&
    effectiveSelectedBrand?.isFleetEnabled === true;
  const {
    data: settings = null,
    isLoading: settingsLoading,
    refetch: refetchSettings,
  } = useQuery({
    enabled: shouldFetchSettings && !!scopedOrganizationId,
    initialData: hasInitialBootstrap ? initialSettings : undefined,
    initialDataUpdatedAt: hasInitialBootstrap
      ? initialDataUpdatedAt
      : undefined,
    queryFn: async () => {
      if (!shouldFetchSettings || !scopedOrganizationId) {
        return null;
      }

      try {
        const bootstrap = await loadClientProtectedBootstrap(
          clientBootstrapCacheKey,
          localBootstrapEnabled ? getLocalAuthService : getAuthService,
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

      if (localBootstrapEnabled) {
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
    queryKey: ['brand-context-settings', scopedOrganizationId],
    staleTime: BRAND_CONTEXT_CACHE_TTL_MS,
  });

  const refreshSettings = useCallback(async () => {
    await refetchSettings();
  }, [refetchSettings]);

  const {
    data: fleetCapabilities = null,
    isLoading: fleetCapabilitiesLoading,
  } = useQuery({
    enabled: shouldFetchFleet && !!scopedOrganizationId && !!scopedBrandId,
    initialData: initialFleetCapabilities ?? undefined,
    initialDataUpdatedAt:
      initialFleetCapabilities != null ? initialDataUpdatedAt : undefined,
    queryFn: async () => {
      if (!shouldFetchFleet || !scopedOrganizationId || !scopedBrandId) {
        return null;
      }

      try {
        const service = await getOrganizationsService();
        return await service.getFleetCapabilities(
          scopedOrganizationId,
          scopedBrandId,
        );
      } catch (error) {
        logger.error('Failed to fetch fleet capabilities', error);
        return null;
      }
    },
    queryKey: ['brand-context-fleet', scopedOrganizationId, scopedBrandId],
    staleTime: BRAND_CONTEXT_CACHE_TTL_MS,
  });

  useEffect(() => {
    if (effectiveIsAuthLoaded && !effectiveIsSignedIn) {
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

  const lastSyncedUrlBrandIdRef = useRef('');

  useEffect(() => {
    if (
      !effectiveIsSignedIn ||
      localBootstrapEnabled ||
      !effectiveUserId ||
      !routeBrand
    ) {
      return;
    }

    const urlBrandId = getBrandEntityId(routeBrand);
    if (!urlBrandId || urlBrandId === lastSyncedUrlBrandIdRef.current) {
      return;
    }

    lastSyncedUrlBrandIdRef.current = urlBrandId;
    if (urlBrandId === authData.brand) {
      return;
    }

    void (async () => {
      try {
        const service = await getUsersService();
        if (typeof service?.patchMeBrand !== 'function') {
          return;
        }

        await service.patchMeBrand(urlBrandId, { isSelected: true });
        clearClientProtectedBootstrapCache();
      } catch (error) {
        lastSyncedUrlBrandIdRef.current = '';
        logger.warn('Failed to persist URL brand as last-used', {
          error,
          reportToSentry: false,
        });
      }
    })();
  }, [
    authData.brand,
    effectiveIsSignedIn,
    effectiveUserId,
    getUsersService,
    localBootstrapEnabled,
    routeBrand,
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
    credentialsError,
    credentialsLoading,
    fleetCapabilities,
    fleetCapabilitiesLoading,
    isBrandScopeResolved,
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
