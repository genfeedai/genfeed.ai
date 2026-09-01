'use client';

import { isBetterAuthEnabled } from '@genfeedai/auth-client';
import { isDesktopClient } from '@genfeedai/config/deployment';
import {
  getOrgSwitchHref,
  parseScopedAppPath,
  ROUTED_ORGANIZATION_STORAGE_KEY,
} from '@genfeedai/constants';
import { getPlaywrightAuthState } from '@genfeedai/helpers/auth/auth.helper';
import { useAuthIdentity } from '@genfeedai/hooks/auth/use-auth-identity/use-auth-identity';
import type { LayoutProps } from '@genfeedai/props/layout/layout.props';
import {
  cancelAndClearAllServiceInstances,
  setRequestOrganizationId,
} from '@genfeedai/services/core/interceptor.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { OrganizationsService } from '@genfeedai/services/organization/organizations.service';
import { useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter } from 'next/navigation';
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { clearClientProtectedBootstrapCache } from '../../providers/protected-bootstrap/client-protected-bootstrap';
import { useContextAuthedService } from '../internal/context-authed-service';

export type RoutedOrganizationStatus =
  | 'failed'
  | 'loading'
  | 'matched'
  | 'switching'
  | 'unauthorized'
  | 'unscoped';

export interface RoutedOrganizationSummary {
  brand: { id: string; label: string } | null;
  id: string;
  isActive: boolean;
  isOwner?: boolean;
  label: string;
  slug: string;
}

interface RoutedOrganizationState {
  confirmedOrganizationId: string | null;
  confirmedOrganizationSlug: string | null;
  organizations: RoutedOrganizationSummary[];
  status: RoutedOrganizationStatus;
}

export interface RoutedOrganizationContextValue
  extends RoutedOrganizationState {
  isRouteConfirmed: boolean;
  retry: () => void;
  switchOrganization: (organizationId: string) => Promise<string | null>;
}

const INITIAL_STATE: RoutedOrganizationState = {
  confirmedOrganizationId: null,
  confirmedOrganizationSlug: null,
  organizations: [],
  status: 'loading',
};

const RoutedOrganizationContext =
  createContext<RoutedOrganizationContextValue | null>(null);

type RoutedOrganizationMismatchReason =
  | 'cross-tab-sync-failed'
  | 'route-auth-mismatch'
  | 'route-unauthorized'
  | 'switch-failed';

function emitSanitizedMismatch(reason: RoutedOrganizationMismatchReason): void {
  logger.warn('Routed organization context mismatch', {
    reportToSentry:
      reason === 'cross-tab-sync-failed' || reason === 'switch-failed',
    tags: {
      eventType: 'organization-context-mismatch',
      reason,
    },
  });
}

function broadcastOrganizationChange(): void {
  try {
    window.localStorage.setItem(
      ROUTED_ORGANIZATION_STORAGE_KEY,
      `${Date.now()}:${Math.random()}`,
    );
  } catch {
    // Storage can be unavailable in hardened browser contexts. The request
    // header remains the authoritative fail-closed boundary in that case.
  }
}

export function RoutedOrganizationProvider({ children }: LayoutProps) {
  const pathname = usePathname() ?? '';
  const { replace } = useRouter();
  const routeOrganizationSlug = parseScopedAppPath(pathname).orgSlug;
  const queryClient = useQueryClient();
  const { isLoaded, isSignedIn, sessionId, userId } = useAuthIdentity();
  const playwrightAuth = getPlaywrightAuthState();
  const effectiveIsLoaded = isLoaded || playwrightAuth?.isLoaded === true;
  const effectiveIsSignedIn = isSignedIn || playwrightAuth?.isSignedIn === true;
  const effectiveSessionId = sessionId ?? 'no-session';
  const effectiveUserId = userId ?? playwrightAuth?.userId ?? 'no-user';
  const bypassReconciliation = !isBetterAuthEnabled() || isDesktopClient();
  const getOrganizationsService = useContextAuthedService((token: string) =>
    OrganizationsService.getInstance(token),
  );
  const [state, setState] = useState<RoutedOrganizationState>(INITIAL_STATE);
  const [retryNonce, setRetryNonce] = useState(0);
  const generationRef = useRef(0);
  const reconciliationQueueRef = useRef<Promise<void>>(Promise.resolve());
  const pathnameRef = useRef(pathname);
  const routeOrganizationSlugRef = useRef(routeOrganizationSlug);
  const stateRef = useRef(state);
  pathnameRef.current = pathname;
  routeOrganizationSlugRef.current = routeOrganizationSlug;
  stateRef.current = state;

  const isCurrentGeneration = useCallback(
    (generation: number, expectedSlug: string): boolean =>
      generationRef.current === generation &&
      routeOrganizationSlugRef.current === expectedSlug,
    [],
  );

  const invalidateTenantState = useCallback(async (): Promise<void> => {
    setRequestOrganizationId(null);
    await queryClient.cancelQueries();
    queryClient.clear();
    clearClientProtectedBootstrapCache();
    cancelAndClearAllServiceInstances();
  }, [queryClient]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: session identity and retryNonce intentionally restart route reconciliation.
  useEffect(() => {
    if (
      bypassReconciliation ||
      !routeOrganizationSlug ||
      (effectiveIsLoaded && !effectiveIsSignedIn)
    ) {
      generationRef.current += 1;
      setRequestOrganizationId(null);
      setState((current) => ({
        ...current,
        confirmedOrganizationId: null,
        confirmedOrganizationSlug: null,
        status: 'unscoped',
      }));
      return;
    }

    if (!effectiveIsLoaded || !effectiveIsSignedIn) {
      generationRef.current += 1;
      setRequestOrganizationId(null);
      setState((current) => ({
        ...current,
        confirmedOrganizationId: null,
        confirmedOrganizationSlug: null,
        status: 'loading',
      }));
      return;
    }

    const generation = generationRef.current + 1;
    generationRef.current = generation;
    setRequestOrganizationId(null);
    setState((current) => ({
      ...current,
      confirmedOrganizationId: null,
      confirmedOrganizationSlug: null,
      status: 'loading',
    }));

    const reconcile = async (): Promise<void> => {
      try {
        await invalidateTenantState();
        const initialService = await getOrganizationsService();
        let organizations =
          (await initialService.getMyOrganizations()) as RoutedOrganizationSummary[];
        const target = organizations.find(
          (organization) => organization.slug === routeOrganizationSlug,
        );

        if (!target) {
          if (isCurrentGeneration(generation, routeOrganizationSlug)) {
            emitSanitizedMismatch('route-unauthorized');
            setState({
              confirmedOrganizationId: null,
              confirmedOrganizationSlug: null,
              organizations,
              status: 'unauthorized',
            });
          }
          return;
        }

        const activeOrganization = organizations.find(
          (organization) => organization.isActive,
        );
        if (activeOrganization?.id !== target.id) {
          emitSanitizedMismatch('route-auth-mismatch');
          if (isCurrentGeneration(generation, routeOrganizationSlug)) {
            setState({
              confirmedOrganizationId: null,
              confirmedOrganizationSlug: null,
              organizations,
              status: 'switching',
            });
          }

          await initialService.switchOrganization(target.id);
          await invalidateTenantState();
          const refreshedService = await getOrganizationsService({
            forceRefresh: true,
          });
          organizations =
            (await refreshedService.getMyOrganizations()) as RoutedOrganizationSummary[];
          broadcastOrganizationChange();
        }

        const confirmedOrganization = organizations.find(
          (organization) =>
            organization.id === target.id && organization.isActive,
        );
        if (!confirmedOrganization) {
          throw new Error('Organization context verification failed');
        }

        if (isCurrentGeneration(generation, routeOrganizationSlug)) {
          setRequestOrganizationId(confirmedOrganization.id);
          setState({
            confirmedOrganizationId: confirmedOrganization.id,
            confirmedOrganizationSlug: confirmedOrganization.slug,
            organizations,
            status: 'matched',
          });
        }
      } catch {
        if (isCurrentGeneration(generation, routeOrganizationSlug)) {
          setRequestOrganizationId(null);
          emitSanitizedMismatch('switch-failed');
          setState((current) => ({
            ...current,
            confirmedOrganizationId: null,
            confirmedOrganizationSlug: null,
            status: 'failed',
          }));
        }
      }
    };

    const queuedReconciliation = reconciliationQueueRef.current
      .catch(() => undefined)
      .then(reconcile);
    reconciliationQueueRef.current = queuedReconciliation;
    void queuedReconciliation;
  }, [
    bypassReconciliation,
    effectiveIsLoaded,
    effectiveIsSignedIn,
    effectiveSessionId,
    effectiveUserId,
    getOrganizationsService,
    invalidateTenantState,
    isCurrentGeneration,
    retryNonce,
    routeOrganizationSlug,
  ]);

  const retry = useCallback(() => {
    setRetryNonce((current) => current + 1);
  }, []);

  const switchOrganization = useCallback(
    async (organizationId: string): Promise<string | null> => {
      const target = stateRef.current.organizations.find(
        (organization) => organization.id === organizationId,
      );
      if (!target) {
        return null;
      }
      if (
        stateRef.current.status === 'matched' &&
        stateRef.current.confirmedOrganizationId === organizationId
      ) {
        return target.slug;
      }

      const generation = generationRef.current + 1;
      generationRef.current = generation;
      setRequestOrganizationId(null);
      setState((current) => ({
        ...current,
        confirmedOrganizationId: null,
        confirmedOrganizationSlug: null,
        status: 'switching',
      }));

      let switchedSlug: string | null = null;
      const switchTask = reconciliationQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          try {
            const service = await getOrganizationsService();
            const authorizedOrganizations =
              (await service.getMyOrganizations()) as RoutedOrganizationSummary[];
            const authorizedTarget = authorizedOrganizations.find(
              (organization) => organization.id === organizationId,
            );
            if (!authorizedTarget) {
              if (generationRef.current === generation) {
                setState((current) => ({
                  ...current,
                  status: 'unauthorized',
                }));
              }
              return;
            }

            if (!authorizedTarget.isActive) {
              await service.switchOrganization(authorizedTarget.id);
            }
            await invalidateTenantState();
            const refreshedService = await getOrganizationsService({
              forceRefresh: true,
            });
            const refreshedOrganizations =
              (await refreshedService.getMyOrganizations()) as RoutedOrganizationSummary[];
            const confirmedTarget = refreshedOrganizations.find(
              (organization) =>
                organization.id === authorizedTarget.id &&
                organization.isActive,
            );
            if (!confirmedTarget) {
              throw new Error('Organization context verification failed');
            }

            broadcastOrganizationChange();
            if (generationRef.current === generation) {
              setState({
                confirmedOrganizationId: confirmedTarget.id,
                confirmedOrganizationSlug: confirmedTarget.slug,
                organizations: refreshedOrganizations,
                status: 'switching',
              });
              switchedSlug = confirmedTarget.slug;
            }
          } catch {
            if (generationRef.current === generation) {
              setRequestOrganizationId(null);
              emitSanitizedMismatch('switch-failed');
              setState((current) => ({
                ...current,
                confirmedOrganizationId: null,
                confirmedOrganizationSlug: null,
                status: 'failed',
              }));
            }
          }
        });

      reconciliationQueueRef.current = switchTask;
      await switchTask;
      return switchedSlug;
    },
    [getOrganizationsService, invalidateTenantState],
  );

  useEffect(() => {
    const synchronizeActiveOrganization = async (
      generation: number,
    ): Promise<void> => {
      try {
        await invalidateTenantState();
        const service = await getOrganizationsService({ forceRefresh: true });
        const organizations =
          (await service.getMyOrganizations()) as RoutedOrganizationSummary[];
        const activeOrganization = organizations.find(
          (organization) => organization.isActive,
        );

        if (!activeOrganization) {
          throw new Error('Active organization context is unavailable');
        }
        if (generationRef.current !== generation) {
          return;
        }

        const currentRouteOrganizationSlug = routeOrganizationSlugRef.current;
        if (activeOrganization.slug === currentRouteOrganizationSlug) {
          setRequestOrganizationId(activeOrganization.id);
          setState({
            confirmedOrganizationId: activeOrganization.id,
            confirmedOrganizationSlug: activeOrganization.slug,
            organizations,
            status: 'matched',
          });
          return;
        }

        replace(getOrgSwitchHref(activeOrganization.slug, pathnameRef.current));
      } catch {
        if (generationRef.current === generation) {
          setRequestOrganizationId(null);
          emitSanitizedMismatch('cross-tab-sync-failed');
          setState((current) => ({
            ...current,
            confirmedOrganizationId: null,
            confirmedOrganizationSlug: null,
            status: 'failed',
          }));
        }
      }
    };

    const handleStorage = (event: StorageEvent): void => {
      if (
        event.key !== ROUTED_ORGANIZATION_STORAGE_KEY ||
        event.newValue === null ||
        !routeOrganizationSlugRef.current
      ) {
        return;
      }

      const generation = generationRef.current + 1;
      generationRef.current = generation;
      setRequestOrganizationId(null);
      setState((current) => ({
        ...current,
        confirmedOrganizationId: null,
        confirmedOrganizationSlug: null,
        status: 'switching',
      }));
      const synchronizationTask = reconciliationQueueRef.current
        .catch(() => undefined)
        .then(() => synchronizeActiveOrganization(generation));
      reconciliationQueueRef.current = synchronizationTask;
      void synchronizationTask;
    };

    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('storage', handleStorage);
      setRequestOrganizationId(null);
    };
  }, [getOrganizationsService, invalidateTenantState, replace]);

  const isRouteConfirmed =
    bypassReconciliation ||
    !routeOrganizationSlug ||
    (effectiveIsLoaded && !effectiveIsSignedIn) ||
    (state.status === 'matched' &&
      state.confirmedOrganizationSlug === routeOrganizationSlug);

  const value = useMemo<RoutedOrganizationContextValue>(
    () => ({
      ...state,
      isRouteConfirmed,
      retry,
      switchOrganization,
    }),
    [isRouteConfirmed, retry, state, switchOrganization],
  );

  return (
    <RoutedOrganizationContext.Provider value={value}>
      {children}
    </RoutedOrganizationContext.Provider>
  );
}

export function useRoutedOrganization(): RoutedOrganizationContextValue {
  const context = use(RoutedOrganizationContext);
  if (!context) {
    throw new Error(
      'useRoutedOrganization must be used within RoutedOrganizationProvider',
    );
  }
  return context;
}
