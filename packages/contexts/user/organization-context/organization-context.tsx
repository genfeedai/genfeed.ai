'use client';

import { isBetterAuthEnabled } from '@genfeedai/auth-client';
import {
  getOrgSwitchHref,
  parseScopedAppPath,
  ROUTED_ORGANIZATION_STORAGE_KEY,
} from '@genfeedai/contracts/constants';
import { isRecord } from '@genfeedai/contracts/constants/type-guards.constant';
import { getPlaywrightAuthState } from '@genfeedai/helpers/auth/auth.helper';
import { useAuthIdentity } from '@genfeedai/hooks/auth/use-auth-identity/use-auth-identity';
import type { LayoutProps } from '@genfeedai/props/layout/layout.props';
import {
  cancelAndClearAllServiceInstances,
  setRequestOrganizationId,
} from '@genfeedai/services/core/interceptor.service';
import { getJsonApiErrorMember } from '@genfeedai/services/core/json-api-error-message';
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
import {
  ContextAuthenticationTokenUnavailableError,
  useContextAuthedService,
} from '../internal/context-authed-service';

const ERROR_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;

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
  logoUrl?: string | null;
  slug: string;
}

interface RoutedOrganizationSwitchFailure {
  kind: 'activation';
}

interface RoutedOrganizationState {
  confirmedOrganizationId: string | null;
  confirmedOrganizationSlug: string | null;
  organizations: RoutedOrganizationSummary[];
  /**
   * The organization an explicit switch is moving to, known from the member's
   * own list the moment it is chosen. Null outside such a switch.
   */
  pendingOrganizationId: string | null;
  status: RoutedOrganizationStatus;
  /**
   * Set when the API refused a switch and the previous organization is back.
   * A new object for every failure, so a consumer can tell one from the last.
   */
  switchFailure: RoutedOrganizationSwitchFailure | null;
}

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

const INITIAL_STATE: RoutedOrganizationState = {
  confirmedOrganizationId: null,
  confirmedOrganizationSlug: null,
  organizations: [],
  pendingOrganizationId: null,
  status: 'loading',
  switchFailure: null,
};

const RoutedOrganizationContext =
  createContext<RoutedOrganizationContextValue | null>(null);

type RoutedOrganizationMismatchReason =
  | 'cross-tab-sync-failed'
  | 'route-auth-mismatch'
  | 'route-unauthorized'
  | 'switch-failed';

/** What made a switch fail, without carrying any payload into the report. */
type RoutedOrganizationFailure =
  | 'auth'
  | 'network'
  | 'timeout'
  | 'unknown'
  | 'verification';

const VERIFICATION_FAILED_MESSAGE = 'Organization context verification failed';

/**
 * How long a route confirmation, switch or cross-tab sync may run before it
 * ends in the failed state with Retry. Reconciliations share one serial
 * queue, so one that never settles (a session token that never arrives, a
 * request the browser never answers) would otherwise hold every later one
 * and leave the app on its frame skeleton for good (#9973).
 */
export const ROUTE_CONFIRMATION_TIMEOUT_MS = 20_000;

class RouteConfirmationTimeoutError extends Error {
  constructor() {
    super('Route confirmation timed out');
    this.name = 'RouteConfirmationTimeoutError';
  }
}

function withConfirmationBound<T>(task: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new RouteConfirmationTimeoutError()),
      ROUTE_CONFIRMATION_TIMEOUT_MS,
    );
    task.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * What `fetch` itself rejects with when the request never got a response,
 * which the auth token exchange lets through unwrapped. In production the
 * Sentry fetch instrumentation appends the request host to these messages,
 * as in `Failed to fetch (api.example.com)`.
 */
const FETCH_TRANSPORT_MESSAGE =
  /^(Failed to fetch|Load failed|NetworkError when attempting to fetch resource|Network request failed)\.?( \([^)]+\))?$/;

function classifyFailure(error: unknown): RoutedOrganizationFailure {
  if (typeof error === 'object' && error !== null) {
    const record = error as Record<string, unknown>;
    if (record.isNetworkError === true) return 'network';
    if (record.isTimeout === true) return 'timeout';
    if (record.isAuthError === true) return 'auth';
  }
  if (error instanceof ContextAuthenticationTokenUnavailableError) {
    return 'auth';
  }
  if (
    error instanceof TypeError &&
    FETCH_TRANSPORT_MESSAGE.test(error.message)
  ) {
    return 'network';
  }
  return error instanceof Error && error.message === VERIFICATION_FAILED_MESSAGE
    ? 'verification'
    : 'unknown';
}

/**
 * The error's class name, so an `unknown` failure can be told apart in Sentry.
 * Only a short identifier is kept; the message and any payload stay out. A
 * rejection that is not an `Error` (the production interceptor rethrows a
 * JSON:API response body as is) is named `NonError`.
 */
function errorNameOf(error: unknown): string | undefined {
  if (!(error instanceof Error)) return 'NonError';
  return ERROR_NAME_PATTERN.test(error.name) ? error.name : undefined;
}

function toHttpStatus(value: unknown): number | undefined {
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 100 &&
    value <= 599
    ? value
    : undefined;
}

/**
 * The numeric HTTP status of a failed request, wherever the rejection carries
 * it: on the error, on its response, or on the first JSON:API error member.
 * Only the number is kept.
 */
function errorStatusOf(error: unknown): string | undefined {
  if (!isRecord(error)) return undefined;
  const status =
    toHttpStatus(error.status) ??
    toHttpStatus(
      isRecord(error.response) ? error.response.status : undefined,
    ) ??
    toHttpStatus(getJsonApiErrorMember(error)?.status);
  return status === undefined ? undefined : String(status);
}

function isClientErrorStatus(error: unknown): boolean {
  const status = Number(errorStatusOf(error));
  return status >= 400 && status < 500;
}

function emitSanitizedMismatch(
  reason: RoutedOrganizationMismatchReason,
  error?: unknown,
): void {
  const failure = error === undefined ? undefined : classifyFailure(error);
  const errorName = failure === 'unknown' ? errorNameOf(error) : undefined;
  const errorStatus = failure === 'unknown' ? errorStatusOf(error) : undefined;
  // A request that never reached the server (offline, aborted by a
  // navigation, timed out) says nothing about which organization is active,
  // so it is logged with its cause but is not a context mismatch to alert on.
  const isTransportFailure = failure === 'network' || failure === 'timeout';
  logger.warn('Routed organization context mismatch', {
    reportToSentry:
      (reason === 'cross-tab-sync-failed' || reason === 'switch-failed') &&
      !isTransportFailure,
    tags: {
      eventType: 'organization-context-mismatch',
      ...(failure ? { failure } : {}),
      ...(errorName ? { errorName } : {}),
      ...(errorStatus ? { errorStatus } : {}),
      reason,
    },
  });
}

function isCancelledMembershipRead(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const record = error as Record<string, unknown>;
  return (
    record.isCancelled === true ||
    record.code === 'ERR_CANCELED' ||
    record.name === 'CanceledError' ||
    record.name === 'AbortError'
  );
}

type ReadOrganizations = (options?: {
  fresh: true;
}) => Promise<RoutedOrganizationSummary[]>;

async function readOrganizations(
  read: ReadOrganizations,
  options?: { fresh: true },
): Promise<RoutedOrganizationSummary[]> {
  try {
    return await read(options);
  } catch (error) {
    if (!isCancelledMembershipRead(error)) throw error;
    return read({ fresh: true });
  }
}

/**
 * Reads membership after activate. The token refresh and the list read start
 * together: the read does not need the new token, and activate has already
 * answered, so the list is not the stale one. A list that was already in
 * flight can still show the previous organization as active, so a miss is read
 * once more, through the refreshed service, before the switch is treated as a
 * real mismatch.
 */
async function readOrganizationsAfterActivation(
  service: { getMyOrganizations: OrganizationsService['getMyOrganizations'] },
  getRefreshedService: () => Promise<{
    getMyOrganizations: OrganizationsService['getMyOrganizations'];
  }>,
  targetId: string,
): Promise<RoutedOrganizationSummary[]> {
  const [refreshedService, organizations] = await Promise.all([
    getRefreshedService(),
    readOrganizations(membershipReader(service), { fresh: true }),
  ]);
  if (
    organizations.some(
      (organization) => organization.id === targetId && organization.isActive,
    )
  ) {
    return organizations;
  }
  return readOrganizations(membershipReader(refreshedService), { fresh: true });
}

function membershipReader(service: {
  getMyOrganizations: OrganizationsService['getMyOrganizations'];
}): ReadOrganizations {
  return (options) => service.getMyOrganizations(options);
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
  // Only a keyless self-hosted deployment has no organizations to reconcile.
  // The desktop shell reaches these routes solely through a cloud sign-in, so
  // it must load and confirm the routed organization exactly like the web app;
  // skipping it left the organization switcher empty on desktop.
  const bypassReconciliation = !isBetterAuthEnabled();
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
  // Set by an explicit switch once it has confirmed the organization, so the
  // route change that follows does not read the list again.
  const switchConfirmationRef = useRef<{
    organizationId: string;
    slug: string;
  } | null>(null);
  const switchRouteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  pathnameRef.current = pathname;
  routeOrganizationSlugRef.current = routeOrganizationSlug;
  stateRef.current = state;

  const isCurrentGeneration = useCallback(
    (generation: number, expectedSlug: string): boolean =>
      generationRef.current === generation &&
      routeOrganizationSlugRef.current === expectedSlug,
    [],
  );

  // A switch confirmation belongs to the generation that made it: anything
  // that supersedes that generation drops it, and with it the wait on the route.
  const clearSwitchConfirmation = useCallback((): void => {
    switchConfirmationRef.current = null;
    if (switchRouteTimerRef.current !== null) {
      clearTimeout(switchRouteTimerRef.current);
      switchRouteTimerRef.current = null;
    }
  }, []);

  useEffect(() => clearSwitchConfirmation, [clearSwitchConfirmation]);

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

    const switched = switchConfirmationRef.current;
    if (switched?.slug === routeOrganizationSlug) {
      // An explicit switch confirmed this organization against the API a
      // moment ago and cleared the previous tenant state; the route has now
      // caught up, so there is nothing left to read.
      clearSwitchConfirmation();
      generationRef.current += 1;
      setRequestOrganizationId(switched.organizationId);
      setState((current) => ({
        ...current,
        confirmedOrganizationId: switched.organizationId,
        confirmedOrganizationSlug: switched.slug,
        pendingOrganizationId: null,
        status: 'matched',
        switchFailure: null,
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
      pendingOrganizationId: null,
      status: 'loading',
    }));

    const confirmRoute = async (): Promise<void> => {
      // A restart (for instance the session identity resolving) can queue this
      // behind a reconciliation that is still running: do not start work that
      // is already superseded.
      if (!isCurrentGeneration(generation, routeOrganizationSlug)) {
        return;
      }
      await invalidateTenantState();
      const initialService = await getOrganizationsService();
      const readMembership = membershipReader(initialService);
      let organizations = await readOrganizations(readMembership);
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
            pendingOrganizationId: null,
            status: 'unauthorized',
            switchFailure: null,
          });
        }
        return;
      }

      const activeOrganization = organizations.find(
        (organization) => organization.isActive,
      );
      let hasSwitchedOrganization = false;
      if (activeOrganization?.id !== target.id) {
        emitSanitizedMismatch('route-auth-mismatch');
        if (isCurrentGeneration(generation, routeOrganizationSlug)) {
          setState({
            confirmedOrganizationId: null,
            confirmedOrganizationSlug: null,
            organizations,
            pendingOrganizationId: null,
            status: 'switching',
            switchFailure: null,
          });
        }

        // A cross-tab change that arrived while this read was in flight has
        // bumped the generation. Activating the route organization now would
        // undo the other tab's switch (#9580).
        if (!isCurrentGeneration(generation, routeOrganizationSlug)) {
          return;
        }
        await initialService.switchOrganization(target.id);
        hasSwitchedOrganization = true;
        // A confirmation that timed out or was overtaken must not clear the
        // tenant state a newer reconciliation has already confirmed.
        if (!isCurrentGeneration(generation, routeOrganizationSlug)) {
          return;
        }
        await invalidateTenantState();
        organizations = await readOrganizationsAfterActivation(
          initialService,
          () => getOrganizationsService({ forceRefresh: true }),
          target.id,
        );
      }

      const confirmedOrganization = organizations.find(
        (organization) =>
          organization.id === target.id && organization.isActive,
      );
      if (!confirmedOrganization) {
        throw new Error(VERIFICATION_FAILED_MESSAGE);
      }

      if (isCurrentGeneration(generation, routeOrganizationSlug)) {
        if (hasSwitchedOrganization) {
          broadcastOrganizationChange();
        }
        setRequestOrganizationId(confirmedOrganization.id);
        setState({
          confirmedOrganizationId: confirmedOrganization.id,
          confirmedOrganizationSlug: confirmedOrganization.slug,
          organizations,
          pendingOrganizationId: null,
          status: 'matched',
          switchFailure: null,
        });
      }
    };

    const reconcile = async (): Promise<void> => {
      try {
        await withConfirmationBound(confirmRoute());
      } catch (error) {
        if (isCurrentGeneration(generation, routeOrganizationSlug)) {
          setRequestOrganizationId(null);
          if (!isCancelledMembershipRead(error)) {
            emitSanitizedMismatch('switch-failed', error);
          }
          setState((current) => ({
            ...current,
            confirmedOrganizationId: null,
            confirmedOrganizationSlug: null,
            status: 'failed',
          }));
          if (error instanceof RouteConfirmationTimeoutError) {
            // The stalled attempt may still finish later; it must not confirm
            // a route the member was already told failed.
            generationRef.current += 1;
          }
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

  const refreshOrganizations = useCallback(async () => {
    const service = await getOrganizationsService({ forceRefresh: true });
    const organizations = (await service.getMyOrganizations({
      fresh: true,
    })) as RoutedOrganizationSummary[];
    setState((current) => ({ ...current, organizations }));
  }, [getOrganizationsService]);

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

      // What the member returns to if the API refuses the switch.
      const previous =
        stateRef.current.status === 'matched' &&
        stateRef.current.confirmedOrganizationId &&
        stateRef.current.confirmedOrganizationSlug
          ? {
              id: stateRef.current.confirmedOrganizationId,
              organizations: stateRef.current.organizations,
              slug: stateRef.current.confirmedOrganizationSlug,
            }
          : null;

      const generation = generationRef.current + 1;
      generationRef.current = generation;
      clearSwitchConfirmation();
      setRequestOrganizationId(null);
      setState((current) => ({
        ...current,
        confirmedOrganizationId: null,
        confirmedOrganizationSlug: null,
        pendingOrganizationId: target.id,
        status: 'switching',
        switchFailure: null,
      }));

      let switchedSlug: string | null = null;
      let isActivated = false;
      const confirmSwitch = async (): Promise<void> => {
        // Everything of the previous organization goes now, not after the
        // activate call: the old data must not outlive the click.
        if (generationRef.current !== generation) {
          return;
        }
        await invalidateTenantState();
        if (generationRef.current !== generation) {
          return;
        }
        const service = await getOrganizationsService();
        if (generationRef.current !== generation) {
          return;
        }

        // Membership is already in memory and activate refuses a non-member,
        // so there is no list read before it.
        await service.switchOrganization(target.id);
        isActivated = true;

        const confirmedOrganizations = await readOrganizationsAfterActivation(
          service,
          () => getOrganizationsService({ forceRefresh: true }),
          target.id,
        );
        const confirmedTarget = confirmedOrganizations.find(
          (organization) =>
            organization.id === target.id && organization.isActive,
        );
        if (!confirmedTarget) {
          throw new Error(VERIFICATION_FAILED_MESSAGE);
        }

        if (generationRef.current !== generation) {
          return;
        }
        await invalidateTenantState();
        if (generationRef.current !== generation) {
          return;
        }
        broadcastOrganizationChange();
        const confirmation = {
          organizationId: confirmedTarget.id,
          slug: confirmedTarget.slug,
        };
        switchConfirmationRef.current = confirmation;
        // The bound on this switch ends here, but the route change that
        // follows can stall too: end in the failed state with Retry rather
        // than leave the page on its loading block.
        switchRouteTimerRef.current = setTimeout(() => {
          switchRouteTimerRef.current = null;
          if (switchConfirmationRef.current !== confirmation) {
            return;
          }
          switchConfirmationRef.current = null;
          generationRef.current += 1;
          setRequestOrganizationId(null);
          setState((current) => ({
            ...current,
            confirmedOrganizationId: null,
            confirmedOrganizationSlug: null,
            pendingOrganizationId: null,
            status: 'failed',
          }));
        }, ROUTE_CONFIRMATION_TIMEOUT_MS);
        setState({
          confirmedOrganizationId: confirmedTarget.id,
          confirmedOrganizationSlug: confirmedTarget.slug,
          organizations: confirmedOrganizations,
          pendingOrganizationId: confirmedTarget.id,
          status: 'switching',
          switchFailure: null,
        });
        switchedSlug = confirmedTarget.slug;
      };

      const switchTask = reconciliationQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          try {
            await withConfirmationBound(confirmSwitch());
          } catch (error) {
            if (generationRef.current !== generation) {
              return;
            }
            if (!isCancelledMembershipRead(error)) {
              emitSanitizedMismatch('switch-failed', error);
            }
            // The API answered with a client error and refused, so the previous
            // organization is still the active one: put its shell back, with
            // the error. A server error can follow a committed write, so it
            // ends in the failed state instead.
            if (!isActivated && previous && isClientErrorStatus(error)) {
              setRequestOrganizationId(previous.id);
              setState({
                confirmedOrganizationId: previous.id,
                confirmedOrganizationSlug: previous.slug,
                organizations: previous.organizations,
                pendingOrganizationId: null,
                status: 'matched',
                switchFailure: { kind: 'activation' },
              });
              return;
            }
            setRequestOrganizationId(null);
            setState((current) => ({
              ...current,
              confirmedOrganizationId: null,
              confirmedOrganizationSlug: null,
              pendingOrganizationId: null,
              status: 'failed',
            }));
            if (error instanceof RouteConfirmationTimeoutError) {
              generationRef.current += 1;
            }
          }
        });

      reconciliationQueueRef.current = switchTask;
      await switchTask;
      return switchedSlug;
    },
    [clearSwitchConfirmation, getOrganizationsService, invalidateTenantState],
  );

  useEffect(() => {
    const synchronizeOnce = async (generation: number): Promise<void> => {
      await invalidateTenantState();
      const service = await getOrganizationsService({ forceRefresh: true });
      const readMembership = membershipReader(service);
      let organizations = await readOrganizations(readMembership, {
        fresh: true,
      });
      if (generationRef.current !== generation) {
        return;
      }

      let activeOrganization = organizations.find(
        (organization) => organization.isActive,
      );
      const currentRouteOrganizationSlug = routeOrganizationSlugRef.current;
      if (
        !activeOrganization ||
        activeOrganization.slug !== currentRouteOrganizationSlug
      ) {
        organizations = await readOrganizations(readMembership, {
          fresh: true,
        });
        if (generationRef.current !== generation) {
          return;
        }
        activeOrganization = organizations.find(
          (organization) => organization.isActive,
        );
      }

      if (!activeOrganization) {
        throw new Error('Active organization context is unavailable');
      }
      if (activeOrganization.slug === routeOrganizationSlugRef.current) {
        setRequestOrganizationId(activeOrganization.id);
        setState({
          confirmedOrganizationId: activeOrganization.id,
          confirmedOrganizationSlug: activeOrganization.slug,
          organizations,
          pendingOrganizationId: null,
          status: 'matched',
          switchFailure: null,
        });
        return;
      }

      replace(getOrgSwitchHref(activeOrganization.slug, pathnameRef.current));
    };

    const synchronizeActiveOrganization = async (
      generation: number,
    ): Promise<void> => {
      try {
        await withConfirmationBound(synchronizeOnce(generation));
      } catch (error) {
        if (generationRef.current === generation) {
          setRequestOrganizationId(null);
          emitSanitizedMismatch('cross-tab-sync-failed');
          setState((current) => ({
            ...current,
            confirmedOrganizationId: null,
            confirmedOrganizationSlug: null,
            status: 'failed',
          }));
          if (error instanceof RouteConfirmationTimeoutError) {
            generationRef.current += 1;
          }
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
      clearSwitchConfirmation();
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
  }, [
    clearSwitchConfirmation,
    getOrganizationsService,
    invalidateTenantState,
    replace,
  ]);

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
