import {
  getOrgSwitchHref,
  ROUTED_ORGANIZATION_STORAGE_KEY,
} from '@genfeedai/contracts/constants';
import { isRecord } from '@genfeedai/contracts/constants/type-guards.constant';
import { getJsonApiErrorMember } from '@genfeedai/services/core/json-api-error-message';

/**
 * The reconciliation of the organization in the URL with the organization the
 * API acts for: confirm, activate, a switch from the member, a switch from
 * another tab, a bound on how long any of it may take. It is a plain class so
 * a model can run the real code (`organization-context.model.spec.ts`); the
 * React provider only feeds it the route, the session and browser events and
 * reads its state through `useSyncExternalStore`.
 */

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

export interface RoutedOrganizationState {
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

const INITIAL_ORGANIZATION_STATE: RoutedOrganizationState = {
  confirmedOrganizationId: null,
  confirmedOrganizationSlug: null,
  organizations: [],
  pendingOrganizationId: null,
  status: 'loading',
  switchFailure: null,
};

export type RoutedOrganizationMismatchReason =
  | 'cross-tab-sync-failed'
  | 'route-auth-mismatch'
  | 'route-unauthorized'
  | 'switch-failed';

export const VERIFICATION_FAILED_MESSAGE =
  'Organization context verification failed';

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

export function withConfirmationBound<T>(task: Promise<T>): Promise<T> {
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
export function errorStatusOf(error: unknown): string | undefined {
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

/** The two calls of the API the reconciliation makes. */
export interface MembershipService {
  getMyOrganizations(options?: {
    fresh?: boolean;
  }): Promise<RoutedOrganizationSummary[]>;
  switchOrganization(organizationId: string): Promise<unknown>;
}

export interface OrganizationControllerPorts {
  /** Tells the other tabs that this tab changed the active organization. */
  broadcastChange(): void;
  /** Cancels and drops everything the previous tenant left in the caches. */
  clearTenantCaches(): Promise<void>;
  /** Moves the page to the organization another tab switched to. */
  navigate(href: string): void;
  /** Reports a mismatch (logging only; carries no payload). */
  reportMismatch(
    reason: RoutedOrganizationMismatchReason,
    error?: unknown,
  ): void;
  /** The organization every API request acts for (the request gate). */
  setRequestOrganizationId(organizationId: string | null): void;
}

/** What starts a reconciliation: a change in any of these restarts it. */
export interface OrganizationReconciliationInputs {
  /** Only a keyless self-hosted deployment has nothing to reconcile. */
  bypass: boolean;
  getMembershipService: GetMembershipService;
  isLoaded: boolean;
  isSignedIn: boolean;
  /** The organization in the URL, if any. */
  routeSlug: string | undefined;
  /** Who the reconciliation is for: another user or session restarts it. */
  sessionKey: string;
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

function membershipReader(service: MembershipService): ReadOrganizations {
  return (options) => service.getMyOrganizations(options);
}

type GetMembershipService = (options?: {
  forceRefresh?: boolean;
}) => Promise<MembershipService>;

/**
 * Reads membership after activate. The token refresh and the list read start
 * together: the read does not need the new token, and activate has already
 * answered, so the list is not the stale one. A list that was already in
 * flight can still show the previous organization as active, so a miss is read
 * once more, through the refreshed service, before the switch is treated as a
 * real mismatch.
 */
async function readOrganizationsAfterActivation(
  service: MembershipService,
  getRefreshedService: () => Promise<MembershipService>,
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

/** What a switch has done so far, shared by its steps and its failure path. */
interface SwitchProgress {
  isActivated: boolean;
  switchedSlug: string | null;
}

/** What the member returns to if the API refuses a switch. */
interface PreviousOrganization {
  id: string;
  organizations: RoutedOrganizationSummary[];
  slug: string;
}

export class OrganizationController {
  private state: RoutedOrganizationState = INITIAL_ORGANIZATION_STATE;
  private readonly listeners = new Set<() => void>();
  private generation = 0;
  private queue: Promise<void> = Promise.resolve();
  private pathname = '';
  private routeSlug: string | undefined;
  private getMembershipService: GetMembershipService | null = null;
  private lastInputs: OrganizationReconciliationInputs | null = null;
  // Set by an explicit switch once it has confirmed the organization, so the
  // route change that follows does not read the list again.
  private switchConfirmation: { organizationId: string; slug: string } | null =
    null;
  private switchRouteTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly ports: OrganizationControllerPorts) {}

  public getState = (): RoutedOrganizationState => this.state;

  public subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /**
   * What the controller reads when it acts on its own (a switch, a refresh, a
   * message from another tab). Cheap and silent: call it on every render.
   */
  public setLatest(latest: {
    getMembershipService: GetMembershipService;
    pathname: string;
    routeSlug: string | undefined;
  }): void {
    this.pathname = latest.pathname;
    this.routeSlug = latest.routeSlug;
    this.getMembershipService = latest.getMembershipService;
  }

  /** Ends everything this controller still has pending (the provider unmounts). */
  public dispose(): void {
    this.clearSwitchConfirmation();
  }

  /** The browser listener of the provider is going away. */
  public release(): void {
    this.ports.setRequestOrganizationId(null);
  }

  public retry(): void {
    if (this.lastInputs) this.restart(this.lastInputs);
  }

  private setState(
    next:
      | RoutedOrganizationState
      | ((current: RoutedOrganizationState) => RoutedOrganizationState),
  ): void {
    this.state = typeof next === 'function' ? next(this.state) : next;
    for (const listener of [...this.listeners]) listener();
  }

  private isCurrentGeneration(generation: number, expectedSlug: string) {
    return this.generation === generation && this.routeSlug === expectedSlug;
  }

  // A switch confirmation belongs to the generation that made it: anything
  // that supersedes that generation drops it, and with it the wait on the route.
  private clearSwitchConfirmation(): void {
    this.switchConfirmation = null;
    if (this.switchRouteTimer !== null) {
      clearTimeout(this.switchRouteTimer);
      this.switchRouteTimer = null;
    }
  }

  private async invalidateTenantState(): Promise<void> {
    this.ports.setRequestOrganizationId(null);
    await this.ports.clearTenantCaches();
  }

  private membership(): GetMembershipService {
    if (!this.getMembershipService) {
      throw new Error('OrganizationController.setLatest was not called');
    }
    return this.getMembershipService;
  }

  /** Starts a reconciliation for the route and session as they are now. */
  public restart(inputs: OrganizationReconciliationInputs): void {
    this.lastInputs = inputs;
    this.routeSlug = inputs.routeSlug;
    this.getMembershipService = inputs.getMembershipService;
    const { getMembershipService, routeSlug } = inputs;

    if (
      inputs.bypass ||
      !routeSlug ||
      (inputs.isLoaded && !inputs.isSignedIn)
    ) {
      this.generation += 1;
      this.ports.setRequestOrganizationId(null);
      this.setState((current) => ({
        ...current,
        confirmedOrganizationId: null,
        confirmedOrganizationSlug: null,
        status: 'unscoped',
      }));
      return;
    }

    if (!inputs.isLoaded || !inputs.isSignedIn) {
      this.generation += 1;
      this.ports.setRequestOrganizationId(null);
      this.setState((current) => ({
        ...current,
        confirmedOrganizationId: null,
        confirmedOrganizationSlug: null,
        status: 'loading',
      }));
      return;
    }

    const switched = this.switchConfirmation;
    if (switched?.slug === routeSlug) {
      // An explicit switch confirmed this organization against the API a
      // moment ago and cleared the previous tenant state; the route has now
      // caught up, so there is nothing left to read.
      this.clearSwitchConfirmation();
      this.generation += 1;
      this.ports.setRequestOrganizationId(switched.organizationId);
      this.setState((current) => ({
        ...current,
        confirmedOrganizationId: switched.organizationId,
        confirmedOrganizationSlug: switched.slug,
        pendingOrganizationId: null,
        status: 'matched',
        switchFailure: null,
      }));
      return;
    }

    const generation = this.generation + 1;
    this.generation = generation;
    this.ports.setRequestOrganizationId(null);
    this.setState((current) => ({
      ...current,
      confirmedOrganizationId: null,
      confirmedOrganizationSlug: null,
      pendingOrganizationId: null,
      status: 'loading',
    }));

    const reconcile = async (): Promise<void> => {
      try {
        await withConfirmationBound(
          this.confirmRoute(generation, routeSlug, getMembershipService),
        );
      } catch (error) {
        this.failReconciliation(generation, routeSlug, error);
      }
    };

    const queuedReconciliation = this.queue
      .catch(() => undefined)
      .then(reconcile);
    this.queue = queuedReconciliation;
    void queuedReconciliation;
  }

  private async confirmRoute(
    generation: number,
    routeSlug: string,
    getMembershipService: GetMembershipService,
  ): Promise<void> {
    // A restart (for instance the session identity resolving) can queue this
    // behind a reconciliation that is still running: do not start work that
    // is already superseded.
    if (!this.isCurrentGeneration(generation, routeSlug)) {
      return;
    }
    await this.invalidateTenantState();
    const initialService = await getMembershipService();
    const readMembership = membershipReader(initialService);
    let organizations = await readOrganizations(readMembership);
    const target = organizations.find(
      (organization) => organization.slug === routeSlug,
    );

    if (!target) {
      if (this.isCurrentGeneration(generation, routeSlug)) {
        this.ports.reportMismatch('route-unauthorized');
        this.setState({
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
      this.ports.reportMismatch('route-auth-mismatch');
      if (this.isCurrentGeneration(generation, routeSlug)) {
        this.setState({
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
      if (!this.isCurrentGeneration(generation, routeSlug)) {
        return;
      }
      await initialService.switchOrganization(target.id);
      hasSwitchedOrganization = true;
      // A confirmation that timed out or was overtaken must not clear the
      // tenant state a newer reconciliation has already confirmed.
      if (!this.isCurrentGeneration(generation, routeSlug)) {
        return;
      }
      await this.invalidateTenantState();
      organizations = await readOrganizationsAfterActivation(
        initialService,
        () => getMembershipService({ forceRefresh: true }),
        target.id,
      );
    }

    const confirmedOrganization = organizations.find(
      (organization) => organization.id === target.id && organization.isActive,
    );
    if (!confirmedOrganization) {
      throw new Error(VERIFICATION_FAILED_MESSAGE);
    }

    if (this.isCurrentGeneration(generation, routeSlug)) {
      if (hasSwitchedOrganization) {
        this.ports.broadcastChange();
      }
      this.ports.setRequestOrganizationId(confirmedOrganization.id);
      this.setState({
        confirmedOrganizationId: confirmedOrganization.id,
        confirmedOrganizationSlug: confirmedOrganization.slug,
        organizations,
        pendingOrganizationId: null,
        status: 'matched',
        switchFailure: null,
      });
    }
  }

  private failReconciliation(
    generation: number,
    routeSlug: string,
    error: unknown,
  ): void {
    if (this.isCurrentGeneration(generation, routeSlug)) {
      this.ports.setRequestOrganizationId(null);
      if (!isCancelledMembershipRead(error)) {
        this.ports.reportMismatch('switch-failed', error);
      }
      this.setState((current) => ({
        ...current,
        confirmedOrganizationId: null,
        confirmedOrganizationSlug: null,
        status: 'failed',
      }));
      if (error instanceof RouteConfirmationTimeoutError) {
        // The stalled attempt may still finish later; it must not confirm
        // a route the member was already told failed.
        this.generation += 1;
      }
    }
  }

  /**
   * Re-reads the organization list (labels, logos) without re-running route
   * reconciliation — for in-place edits such as a new organization logo.
   */
  public async refreshOrganizations(): Promise<void> {
    const service = await this.membership()({ forceRefresh: true });
    const organizations = await service.getMyOrganizations({ fresh: true });
    this.setState((current) => ({ ...current, organizations }));
  }

  public async switchOrganization(
    organizationId: string,
  ): Promise<string | null> {
    const getMembershipService = this.membership();
    const target = this.state.organizations.find(
      (organization) => organization.id === organizationId,
    );
    if (!target) {
      return null;
    }
    if (
      this.state.status === 'matched' &&
      this.state.confirmedOrganizationId === organizationId
    ) {
      return target.slug;
    }

    // What the member returns to if the API refuses the switch.
    const previous =
      this.state.status === 'matched' &&
      this.state.confirmedOrganizationId &&
      this.state.confirmedOrganizationSlug
        ? {
            id: this.state.confirmedOrganizationId,
            organizations: this.state.organizations,
            slug: this.state.confirmedOrganizationSlug,
          }
        : null;

    const generation = this.generation + 1;
    this.generation = generation;
    this.clearSwitchConfirmation();
    this.ports.setRequestOrganizationId(null);
    this.setState((current) => ({
      ...current,
      confirmedOrganizationId: null,
      confirmedOrganizationSlug: null,
      pendingOrganizationId: target.id,
      status: 'switching',
      switchFailure: null,
    }));

    const progress: SwitchProgress = { isActivated: false, switchedSlug: null };
    const switchTask = this.queue
      .catch(() => undefined)
      .then(async () => {
        try {
          await withConfirmationBound(
            this.confirmSwitch(
              generation,
              target,
              getMembershipService,
              progress,
            ),
          );
        } catch (error) {
          this.failSwitch(generation, error, progress, previous);
        }
      });

    this.queue = switchTask;
    await switchTask;
    return progress.switchedSlug;
  }

  private async confirmSwitch(
    generation: number,
    target: RoutedOrganizationSummary,
    getMembershipService: GetMembershipService,
    progress: SwitchProgress,
  ): Promise<void> {
    // Everything of the previous organization goes now, not after the
    // activate call: the old data must not outlive the click.
    if (this.generation !== generation) {
      return;
    }
    await this.invalidateTenantState();
    if (this.generation !== generation) {
      return;
    }
    const service = await getMembershipService();
    if (this.generation !== generation) {
      return;
    }

    // Membership is already in memory and activate refuses a non-member,
    // so there is no list read before it.
    await service.switchOrganization(target.id);
    progress.isActivated = true;

    const confirmedOrganizations = await readOrganizationsAfterActivation(
      service,
      () => getMembershipService({ forceRefresh: true }),
      target.id,
    );
    const confirmedTarget = confirmedOrganizations.find(
      (organization) => organization.id === target.id && organization.isActive,
    );
    if (!confirmedTarget) {
      throw new Error(VERIFICATION_FAILED_MESSAGE);
    }

    if (this.generation !== generation) {
      return;
    }
    await this.invalidateTenantState();
    if (this.generation !== generation) {
      return;
    }
    this.ports.broadcastChange();
    const confirmation = {
      organizationId: confirmedTarget.id,
      slug: confirmedTarget.slug,
    };
    this.switchConfirmation = confirmation;
    // The bound on this switch ends here, but the route change that
    // follows can stall too: end in the failed state with Retry rather
    // than leave the page on its loading block.
    this.switchRouteTimer = setTimeout(() => {
      this.switchRouteTimer = null;
      if (this.switchConfirmation !== confirmation) {
        return;
      }
      this.switchConfirmation = null;
      this.generation += 1;
      this.ports.setRequestOrganizationId(null);
      this.setState((current) => ({
        ...current,
        confirmedOrganizationId: null,
        confirmedOrganizationSlug: null,
        pendingOrganizationId: null,
        status: 'failed',
      }));
    }, ROUTE_CONFIRMATION_TIMEOUT_MS);
    this.setState({
      confirmedOrganizationId: confirmedTarget.id,
      confirmedOrganizationSlug: confirmedTarget.slug,
      organizations: confirmedOrganizations,
      pendingOrganizationId: confirmedTarget.id,
      status: 'switching',
      switchFailure: null,
    });
    progress.switchedSlug = confirmedTarget.slug;
  }

  private failSwitch(
    generation: number,
    error: unknown,
    progress: SwitchProgress,
    previous: PreviousOrganization | null,
  ): void {
    if (this.generation !== generation) {
      return;
    }
    if (!isCancelledMembershipRead(error)) {
      this.ports.reportMismatch('switch-failed', error);
    }
    // The API answered with a client error and refused, so the previous
    // organization is still the active one: put its shell back, with
    // the error. A server error can follow a committed write, so it
    // ends in the failed state instead.
    if (!progress.isActivated && previous && isClientErrorStatus(error)) {
      this.ports.setRequestOrganizationId(previous.id);
      this.setState({
        confirmedOrganizationId: previous.id,
        confirmedOrganizationSlug: previous.slug,
        organizations: previous.organizations,
        pendingOrganizationId: null,
        status: 'matched',
        switchFailure: { kind: 'activation' },
      });
      return;
    }
    this.ports.setRequestOrganizationId(null);
    this.setState((current) => ({
      ...current,
      confirmedOrganizationId: null,
      confirmedOrganizationSlug: null,
      pendingOrganizationId: null,
      status: 'failed',
    }));
    if (error instanceof RouteConfirmationTimeoutError) {
      this.generation += 1;
    }
  }

  /** Another tab changed the active organization. */
  public handleStorageChange(event: {
    key: string | null;
    newValue: string | null;
  }): void {
    if (
      event.key !== ROUTED_ORGANIZATION_STORAGE_KEY ||
      event.newValue === null ||
      !this.routeSlug
    ) {
      return;
    }

    const generation = this.generation + 1;
    this.generation = generation;
    this.clearSwitchConfirmation();
    this.ports.setRequestOrganizationId(null);
    this.setState((current) => ({
      ...current,
      confirmedOrganizationId: null,
      confirmedOrganizationSlug: null,
      status: 'switching',
    }));
    const synchronizationTask = this.queue
      .catch(() => undefined)
      .then(() => this.synchronizeActiveOrganization(generation));
    this.queue = synchronizationTask;
    void synchronizationTask;
  }

  private async synchronizeOnce(generation: number): Promise<void> {
    const getMembershipService = this.membership();
    await this.invalidateTenantState();
    const service = await getMembershipService({ forceRefresh: true });
    const readMembership = membershipReader(service);
    let organizations = await readOrganizations(readMembership, {
      fresh: true,
    });
    if (this.generation !== generation) {
      return;
    }

    let activeOrganization = organizations.find(
      (organization) => organization.isActive,
    );
    if (!activeOrganization || activeOrganization.slug !== this.routeSlug) {
      organizations = await readOrganizations(readMembership, {
        fresh: true,
      });
      if (this.generation !== generation) {
        return;
      }
      activeOrganization = organizations.find(
        (organization) => organization.isActive,
      );
    }

    if (!activeOrganization) {
      throw new Error('Active organization context is unavailable');
    }
    if (activeOrganization.slug === this.routeSlug) {
      this.ports.setRequestOrganizationId(activeOrganization.id);
      this.setState({
        confirmedOrganizationId: activeOrganization.id,
        confirmedOrganizationSlug: activeOrganization.slug,
        organizations,
        pendingOrganizationId: null,
        status: 'matched',
        switchFailure: null,
      });
      return;
    }

    this.ports.navigate(
      getOrgSwitchHref(activeOrganization.slug, this.pathname),
    );
  }

  private async synchronizeActiveOrganization(
    generation: number,
  ): Promise<void> {
    try {
      await withConfirmationBound(this.synchronizeOnce(generation));
    } catch (error) {
      if (this.generation === generation) {
        this.ports.setRequestOrganizationId(null);
        this.ports.reportMismatch('cross-tab-sync-failed');
        this.setState((current) => ({
          ...current,
          confirmedOrganizationId: null,
          confirmedOrganizationSlug: null,
          status: 'failed',
        }));
        if (error instanceof RouteConfirmationTimeoutError) {
          this.generation += 1;
        }
      }
    }
  }
}
