import { ROUTED_ORGANIZATION_STORAGE_KEY } from '@genfeedai/contracts/constants';
import { RequestOrganizationGate } from '@genfeedai/services/core/request-organization-gate';
import {
  explore,
  type Scenario,
  type Simulation,
} from '@genfeedai/utils/model-checking/interleaving-explorer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type MembershipService,
  OrganizationController,
  ROUTE_CONFIRMATION_TIMEOUT_MS,
  type RoutedOrganizationState,
  type RoutedOrganizationSummary,
} from './organization-controller';

/**
 * The page is drawn from the device's last confirmed copy while the session
 * and the membership check run (slice D of #10931). This model runs the real
 * `OrganizationController` and the real `RequestOrganizationGate` against a
 * server whose every call is a step, a device that holds the copy, a query
 * cache the shell restored from it and a shell that reads through the gate,
 * in every order, with the member removed, another user signing in, another
 * tab switching and the clock passing.
 *
 * Invariants:
 * - **I1** a workspace answer for an organization other than the one on
 *   screen is never used;
 * - **I2** while provisional no request outside the allowlist reaches the
 *   server;
 * - **I3** what is on screen was restored for this session's user and the
 *   organization on screen;
 * - **I4** after a refusal the query cache and the device are empty and no
 *   request for the refused organization is sent later;
 * - **I6** a failed read never wipes a store and never releases a request;
 * - **I8** every held request ends sent with the header or rejected;
 * - **I10** a confirmation of the same organization keeps what was restored.
 *
 * Replays, each against code without the guard it names: **R1** a shell that
 * reads without the gate, **R6** a device copy drawn without checking the
 * session tag.
 */

type OrganizationId = 'org-a' | 'org-b';
type UserId = 'user-1' | 'user-2';

const SLUG: Record<OrganizationId, string> = { 'org-a': 'a', 'org-b': 'b' };

type DeviceRecord = {
  organizationId: OrganizationId;
  tag: UserId;
  userId: UserId;
};

type Received = {
  answeredFor: OrganizationId;
  exempt: boolean;
  header: string | null;
  provisional: boolean;
};

type Use = { answeredFor: string; onScreen: string | null };

type World = {
  active: OrganizationId;
  /** The session cookie's tag, and who the session answers once it does. */
  cookieTag: UserId;
  device: { record: DeviceRecord | null; stores: number };
  eventDelivered: boolean;
  gate: RequestOrganizationGate;
  members: OrganizationId[];
  membershipAnswers: number;
  /** A held read the shell has not yet seen settle. */
  pending: number;
  query: Array<{ scope: OrganizationId; userId: UserId }>;
  reads: number;
  received: Received[];
  routeTarget: string | null;
  sessionAnswered: boolean;
  sessionUser: UserId;
  uses: Use[];
  wipes: Array<{ afterAnswer: boolean }>;
  /** A held request was sent although the check did not name its organization. */
  wrongSend: string | null;
};

type Options = {
  /** The device holds a copy for org-a, saved for user-1. */
  copy: boolean;
  /** The session cookie belongs to another user than the copy's. */
  copyOfAnotherSession?: boolean;
  /** A read may never be answered. */
  hangs?: boolean;
  /** The member is removed from org-a at some point. */
  removal?: boolean;
  /** The user has to sign in as someone else. */
  otherUser?: boolean;
  /** Another tab activates org-b and tells this one. */
  otherTab?: boolean;
  /** The shell reads workspace data, through the gate. */
  reads: boolean;
};

function summaries(world: World): RoutedOrganizationSummary[] {
  return world.members.map((id) => ({
    brand: null,
    id,
    isActive: world.active === id,
    label: id,
    slug: SLUG[id],
  }));
}

function membershipService(
  world: World,
  sim: Simulation,
  hangs: boolean,
): MembershipService {
  return {
    async getMyOrganizations() {
      const outcome = await sim.choose(
        'read organizations',
        hangs
          ? (['answers', 'fails', 'never answers'] as const)
          : (['answers', 'fails'] as const),
      );
      if (outcome === 'never answers') return new Promise(() => undefined);
      if (outcome === 'fails') {
        throw Object.assign(new Error('offline'), { isNetworkError: true });
      }
      world.membershipAnswers += 1;
      return summaries(world);
    },
    async switchOrganization(id: string) {
      const outcome = await sim.choose(`activate ${id}`, [
        'answers',
        'fails',
      ] as const);
      if (outcome === 'fails') {
        throw Object.assign(new Error('offline'), { isNetworkError: true });
      }
      if (!world.members.includes(id as OrganizationId)) {
        throw Object.assign(new Error('forbidden'), { status: 403 });
      }
      world.active = id as OrganizationId;
      return {};
    },
  };
}

/**
 * What the adapter decides from the device and the session: the copy is drawn
 * only for this route, under the session tag of the cookie, and for the user
 * the session names once it has answered.
 */
function copyFor(
  world: World,
  routeSlug: string,
  checksTag: boolean,
): { organizationId: string; userId: string } | null {
  const record = world.device.record;
  if (!record || SLUG[record.organizationId] !== routeSlug) return null;
  if (checksTag && record.tag !== world.cookieTag) return null;
  if (world.sessionAnswered && record.userId !== world.sessionUser) return null;
  return { organizationId: record.organizationId, userId: record.userId };
}

function screenOrganization(state: RoutedOrganizationState): string | null {
  return state.provisionalOrganizationId ?? state.confirmedOrganizationId;
}

type Variant = { checksTag: boolean; gatedShell: boolean };

function scenarioOf(options: Options, variant: Variant): () => Scenario {
  return () => {
    const world: World = {
      active: 'org-a',
      cookieTag: options.copyOfAnotherSession ? 'user-2' : 'user-1',
      device: {
        record: options.copy
          ? { organizationId: 'org-a', tag: 'user-1', userId: 'user-1' }
          : null,
        stores: options.copy ? 2 : 0,
      },
      eventDelivered: false,
      gate: new RequestOrganizationGate(),
      members: ['org-a', 'org-b'],
      membershipAnswers: 0,
      pending: 0,
      query: [],
      reads: 0,
      received: [],
      routeTarget: null,
      sessionAnswered: false,
      sessionUser:
        options.otherUser || options.copyOfAnotherSession ? 'user-2' : 'user-1',
      uses: [],
      wipes: [],
      wrongSend: null,
    };
    let controller: OrganizationController | null = null;
    let routeSlug = 'a';
    let signedIn = false;
    let started = { removed: false, signedIn: false, mailed: false };
    vi.clearAllTimers();
    vi.setSystemTime(0);

    const hasRestored = (): boolean => world.query.length > 0;

    const restoreFromCopy = (): void => {
      const copy = copyFor(world, routeSlug, variant.checksTag);
      if (copy && !hasRestored()) {
        world.query.push({
          scope: copy.organizationId as OrganizationId,
          userId: copy.userId as UserId,
        });
      }
    };

    const restart = (): void => {
      const service = serviceOf();
      controller?.restart({
        bypass: false,
        getMembershipService: async () => service,
        isLoaded: world.sessionAnswered,
        isSignedIn: signedIn,
        provisional: copyFor(world, routeSlug, variant.checksTag),
        routeSlug,
        sessionKey: `${world.sessionUser}:${world.sessionAnswered}`,
      });
      restoreFromCopy();
    };

    let serviceHandle: MembershipService | null = null;
    const serviceOf = (): MembershipService => {
      if (!serviceHandle) throw new Error('service not ready');
      return serviceHandle;
    };

    const receive = (header: string | null, exempt: boolean): Received => {
      const received: Received = {
        answeredFor: (header as OrganizationId | null) ?? world.active,
        exempt,
        header,
        provisional: world.gate.isProvisional(),
      };
      world.received.push(received);
      return received;
    };

    return {
      final: () => {
        if (world.pending > 0) {
          return 'a held request ends neither sent nor rejected';
        }
        return null;
      },
      invariant: () => {
        const state = controller?.getState();
        if (!state) return null;
        const onScreen = screenOrganization(state);

        const leaked = world.received.find(
          (request) => request.provisional && !request.exempt,
        );
        if (leaked) {
          return `a workspace request (header ${leaked.header}) reached the server while provisional`;
        }
        if (world.wrongSend) return world.wrongSend;

        const wrongAnswer = world.uses.find(
          (use) => use.onScreen !== null && use.onScreen !== use.answeredFor,
        );
        if (wrongAnswer) {
          return `an answer for ${wrongAnswer.answeredFor} was used on the page of ${wrongAnswer.onScreen}`;
        }

        const expectedUser = world.sessionAnswered
          ? world.sessionUser
          : world.cookieTag;
        const wrongUser = world.query.find(
          (entry) => entry.userId !== expectedUser,
        );
        if (wrongUser) {
          return `an entry restored for ${wrongUser.userId} is on screen for ${expectedUser}`;
        }
        if (onScreen) {
          const wrongScope = world.query.find(
            (entry) => entry.scope !== onScreen,
          );
          if (wrongScope) {
            return `an entry for ${wrongScope.scope} is on screen for ${onScreen}`;
          }
        }

        if (state.status === 'unauthorized') {
          if (world.query.length > 0 || world.device.stores > 0) {
            return 'after a refusal something of the workspace is still on the device or on screen';
          }
        }

        const earlyWipe = world.wipes.find((wipe) => !wipe.afterAnswer);
        if (earlyWipe) {
          return 'a store was wiped before the membership check answered';
        }
        if (
          world.membershipAnswers === 0 &&
          world.gate.getConfirmedOrganizationId() !== null
        ) {
          return 'the gate confirmed an organization before the check answered';
        }
        return null;
      },
      snapshot: () =>
        JSON.stringify([
          controller?.getState(),
          world.gate.getPhase(),
          world.active,
          world.members,
          world.sessionAnswered,
          world.device,
          world.query,
          world.received,
          world.pending,
          world.reads,
          world.uses,
          world.wipes,
          world.routeTarget,
          world.membershipAnswers,
          world.eventDelivered,
          vi.getTimerCount(),
          Date.now(),
          started,
          world.wrongSend,
        ]),
      start: (sim) => {
        const service = membershipService(world, sim, options.hangs === true);
        serviceHandle = service;
        controller = new OrganizationController({
          broadcastChange: () => undefined,
          clearTenantCaches: async () => {
            world.query = [];
          },
          navigate: (href) => {
            world.routeTarget = href.split('/').filter(Boolean)[0] ?? null;
          },
          reportMismatch: () => undefined,
          setProvisionalOrganization: (organizationId, userId) => {
            world.gate.setProvisional(organizationId, userId);
          },
          setRequestOrganizationId: (organizationId) => {
            if (organizationId) world.gate.setConfirmed(organizationId);
            else world.gate.setUnscoped();
          },
          wipeDeviceStores: async () => {
            world.wipes.push({
              afterAnswer:
                world.membershipAnswers > 0 ||
                (world.sessionAnswered &&
                  world.device.record?.userId !== world.sessionUser),
            });
            world.device = { record: null, stores: 0 };
          },
        });
        const mounted = controller;
        const latest = () =>
          mounted.setLatest({
            getMembershipService: async () => service,
            pathname: `/${routeSlug}/overview`,
            routeSlug,
          });
        latest();

        sim.spawn('tab', async () => {
          restart();
        });

        // The session answers once, signed in.
        sim.environment(
          'the session answers',
          () => !started.signedIn,
          () => {
            started = { ...started, signedIn: true };
            world.sessionAnswered = true;
            signedIn = true;
            latest();
            restart();
          },
        );

        if (options.reads) {
          // The shell is mounted while the page is drawn from the copy or the
          // organization is confirmed, and reads then, through the gate.
          sim.environment(
            'the shell reads workspace data',
            () => {
              const state = mounted.getState();
              return (
                world.reads < 2 &&
                (state.provisionalOrganizationId !== null ||
                  state.status === 'matched')
              );
            },
            () => {
              world.reads += 1;
              void (async () => {
                world.pending += 1;
                let header: string | null;
                try {
                  header = variant.gatedShell
                    ? ((await world.gate.whenSettledHeaders())[
                        'x-genfeed-organization-id'
                      ] ?? null)
                    : world.gate.getConfirmedOrganizationId();
                } catch {
                  // A rejected request is never sent.
                  world.pending -= 1;
                  return;
                }
                world.pending -= 1;
                const confirmed = world.gate.getConfirmedOrganizationId();
                if (header !== null && confirmed !== header) {
                  world.wrongSend = `a held request for ${header} was released while the check named ${confirmed}`;
                }
                await sim.step('GET /workspace');
                const received = receive(header, false);
                if (header !== null && header !== world.active) return;
                world.uses.push({
                  answeredFor: received.answeredFor,
                  onScreen: screenOrganization(mounted.getState()),
                });
              })();
            },
          );
        }

        sim.environment(
          'time passes',
          () => vi.getTimerCount() > 0,
          () => vi.advanceTimersByTime(ROUTE_CONFIRMATION_TIMEOUT_MS),
        );

        sim.environment(
          'the route follows the active organization',
          () => world.routeTarget !== null,
          () => {
            const slug = world.routeTarget;
            world.routeTarget = null;
            if (slug) {
              routeSlug = slug;
              latest();
              restart();
            }
          },
        );

        if (options.removal) {
          sim.environment(
            'the member is removed from org-a',
            () => !started.removed,
            () => {
              started = { ...started, removed: true };
              world.members = ['org-b'];
              if (world.active === 'org-a') world.active = 'org-b';
            },
          );
        }

        if (options.otherTab) {
          sim.spawn('other tab', async () => {
            await sim.step('other tab activates org-b');
            if (world.members.includes('org-b')) world.active = 'org-b';
            await sim.step('the other tab tells this one');
            world.eventDelivered = true;
            mounted.handleStorageChange({
              key: ROUTED_ORGANIZATION_STORAGE_KEY,
              newValue: 'changed',
            });
          });
        }
      },
    };
  };
}

describe('the provisional window, every interleaving', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const real: Variant = { checksTag: true, gatedShell: true };

  it('holds when the shell reads while the check runs and the member is removed', async () => {
    const result = await explore(
      scenarioOf({ copy: true, reads: true, removal: true }, real),
    );

    expect(result.violation).toBeNull();
    expect(result.schedules).toBeGreaterThan(20);
  });

  it('holds when another user signs in on the same device', async () => {
    const result = await explore(
      scenarioOf({ copy: true, otherUser: true, reads: true }, real),
    );

    expect(result.violation).toBeNull();
    expect(result.schedules).toBeGreaterThan(5);
  });

  it('holds when a read never answers and another tab switches', async () => {
    const result = await explore(
      scenarioOf(
        { copy: true, hangs: true, otherTab: true, reads: true },
        real,
      ),
    );

    expect(result.violation).toBeNull();
    expect(result.schedules).toBeGreaterThan(20);
  });

  it('fails on a shell that reads without the gate (R1)', async () => {
    const result = await explore(
      scenarioOf(
        { copy: true, otherTab: true, reads: true },
        {
          checksTag: true,
          gatedShell: false,
        },
      ),
    );

    expect(result.violation).toEqual({
      message:
        'a workspace request (header null) reached the server while provisional',
      trace: [
        'other tab: other tab activates org-b',
        'environment: the session answers',
        'main: read organizations -> answers',
        'main: activate org-a -> answers',
        'environment: the shell reads workspace data',
        'main: GET /workspace',
      ],
    });
  });

  it('fails on a device copy drawn without the session tag (R6)', async () => {
    const result = await explore(
      scenarioOf(
        { copy: true, copyOfAnotherSession: true, reads: false },
        {
          checksTag: false,
          gatedShell: true,
        },
      ),
    );

    expect(result.violation).toEqual({
      message: 'an entry restored for user-1 is on screen for user-2',
      trace: [],
    });
  });
});
