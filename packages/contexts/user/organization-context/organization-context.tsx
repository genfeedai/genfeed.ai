'use client';

import { isBetterAuthEnabled } from '@genfeedai/auth-client';
import {
  parseScopedAppPath,
  ROUTED_ORGANIZATION_STORAGE_KEY,
} from '@genfeedai/contracts/constants';
import { getPlaywrightAuthState } from '@genfeedai/helpers/auth/auth.helper';
import { useAuthIdentity } from '@genfeedai/hooks/auth/use-auth-identity/use-auth-identity';
import {
  cancelAndClearAllServiceInstances,
  setProvisionalRequestOrganization,
  setRequestOrganizationId,
} from '@genfeedai/services/core/interceptor.service';
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
  useSyncExternalStore,
} from 'react';
import { clearClientProtectedBootstrapCache } from '../../providers/protected-bootstrap/client-protected-bootstrap';
import { useContextAuthedService } from '../internal/context-authed-service';
import {
  OrganizationController,
  type OrganizationControllerPorts,
  type OrganizationReconciliationInputs,
  type RoutedOrganizationState,
} from './organization-controller';
import { emitSanitizedMismatch } from './organization-mismatch-report';
import type { RoutedOrganizationProviderProps } from './organization-provider.props';

export {
  ROUTE_CONFIRMATION_TIMEOUT_MS,
  type RoutedOrganizationSummary,
} from './organization-controller';

export interface RoutedOrganizationContextValue
  extends RoutedOrganizationState {
  isRouteConfirmed: boolean;
  /**
   * Re-reads the organization list (labels, logos) without re-running route
   * reconciliation — for in-place edits such as a new organization logo.
   */
  refreshOrganizations: () => Promise<void>;
  retry: () => void;
  switchOrganization: (organizationId: string) => Promise<string | null>;
}

const RoutedOrganizationContext =
  createContext<RoutedOrganizationContextValue | null>(null);

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

export function RoutedOrganizationProvider({
  children,
  provisional = null,
  wipeDeviceStores,
}: RoutedOrganizationProviderProps) {
  // Trimmed once, so the controller and the request gate name the same
  // organization; a blank id is no copy.
  const provisionalOrganizationId = provisional?.organizationId.trim() || null;
  const provisionalUserId = provisional?.userId ?? null;
  // The controller outlives renders: it reaches the latest callback, not the
  // one of the render that created it.
  const wipeDeviceStoresRef = useRef(wipeDeviceStores);
  wipeDeviceStoresRef.current = wipeDeviceStores;
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
  // Only a keyless self-hosted deployment has no organizations to reconcile.
  // The desktop shell reaches these routes solely through a cloud sign-in, so
  // it must load and confirm the routed organization exactly like the web app;
  // skipping it left the organization switcher empty on desktop.
  const bypassReconciliation = !isBetterAuthEnabled();
  const getOrganizationsService = useContextAuthedService((token: string) =>
    OrganizationsService.getInstance(token),
  );

  const [controller] = useState(
    () =>
      new OrganizationController({
        broadcastChange: broadcastOrganizationChange,
        clearTenantCaches: async () => {
          await queryClient.cancelQueries();
          queryClient.clear();
          clearClientProtectedBootstrapCache();
          cancelAndClearAllServiceInstances();
        },
        navigate: (href) => replace(href),
        reportMismatch: emitSanitizedMismatch,
        setProvisionalOrganization: setProvisionalRequestOrganization,
        setRequestOrganizationId,
        wipeDeviceStores: async () => {
          await wipeDeviceStoresRef.current?.();
        },
      } satisfies OrganizationControllerPorts),
  );
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getState,
    controller.getState,
  );
  // What the controller reads when it acts on its own, as the render saw it.
  controller.setLatest({
    getMembershipService: getOrganizationsService,
    pathname,
    routeSlug: routeOrganizationSlug,
  });

  // use-effect-audit: ignore releases timers, requests or subscriptions on unmount
  useEffect(() => () => controller.dispose(), [controller]);

  const reconciliation = useMemo<OrganizationReconciliationInputs>(
    () => ({
      bypass: bypassReconciliation,
      getMembershipService: getOrganizationsService,
      isLoaded: effectiveIsLoaded,
      isSignedIn: effectiveIsSignedIn,
      provisional:
        provisionalOrganizationId && provisionalUserId
          ? {
              organizationId: provisionalOrganizationId,
              userId: provisionalUserId,
            }
          : null,
      routeSlug: routeOrganizationSlug,
      sessionKey: `${effectiveUserId}:${effectiveSessionId}`,
    }),
    [
      bypassReconciliation,
      effectiveIsLoaded,
      effectiveIsSignedIn,
      effectiveSessionId,
      effectiveUserId,
      getOrganizationsService,
      provisionalOrganizationId,
      provisionalUserId,
      routeOrganizationSlug,
    ],
  );

  // use-effect-audit: ignore restarts the route reconciliation when the route or the session changes
  useEffect(() => {
    controller.restart(reconciliation);
  }, [controller, reconciliation]);

  // use-effect-audit: ignore subscribes to browser events
  useEffect(() => {
    const handleStorage = (event: StorageEvent): void => {
      controller.handleStorageChange(event);
    };

    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('storage', handleStorage);
      controller.release();
    };
  }, [controller]);

  const retry = useCallback(() => controller.retry(), [controller]);
  const refreshOrganizations = useCallback(
    () => controller.refreshOrganizations(),
    [controller],
  );
  const switchOrganization = useCallback(
    (organizationId: string) => controller.switchOrganization(organizationId),
    [controller],
  );

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
      refreshOrganizations,
      retry,
      switchOrganization,
    }),
    [isRouteConfirmed, refreshOrganizations, retry, state, switchOrganization],
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
