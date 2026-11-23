import { ROUTED_ORGANIZATION_STORAGE_KEY } from '@genfeedai/contracts/constants';
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
  type RoutedOrganizationStatus,
  type RoutedOrganizationSummary,
  withConfirmationBound,
} from './organization-controller';

/**
 * A member opens a workspace URL while the session, the membership read and the
 * organization activation are still to run, with a second tab that can switch
 * organization at any moment. This model runs the real
 * `OrganizationController` over a server whose every call is an atomic step
 * that can also fail or never answer, and states what must hold in every
 * order.
 *
 * Harms it states:
 * - **I1** a workspace answer for an organization other than the one on screen
 *   is used (the request organization and the screen move together, and a
 *   switch cancels what was in flight);
 * - **I8** a schedule ends with the page still loading or switching, for ever;
 * - **I9** after another tab's switch reached this tab, this tab activates its
 *   own organization and undoes it (#9580).
 *
 * #9973 (a request the browser never answers holds the serial queue) is
 * replayed as I8, and #9580 as I9, against a compact copy of the code before
 * each fix.
 */

type OrganizationId = 'org-a' | 'org-b';

const SLUG: Record<OrganizationId, string> = { 'org-a': 'a', 'org-b': 'b' };
const SETTLED: readonly RoutedOrganizationStatus[] = [
  'failed',
  'matched',
  'unauthorized',
  'unscoped',
];

type Use = { answeredFor: string; onScreen: string | null };

type World = {
  activations: Array<{ afterOtherTab: boolean; id: string }>;
  active: OrganizationId;
  epoch: number;
  eventDelivered: boolean;
  members: OrganizationId[];
  reads: number;
  requestOrganizationId: string | null;
  /** The route another tab's switch asked this tab to move to. */
  routeTarget: string | null;
  uses: Use[];
};

/** What a model needs of a tab, whatever code drives it. */
type Tab = {
  restart: (options?: { isSignedIn?: boolean; routeSlug?: string }) => void;
  storage: () => void;
  switchTo?: (id: OrganizationId) => void;
  view: () => {
    confirmedOrganizationId: string | null;
    pendingOrganizationId: string | null;
    status: RoutedOrganizationStatus;
  };
};

type Options = {
  /** The member opens the other organization's URL while this one loads. */
  navigates?: boolean;
  /** Another tab activates org-b and tells this one. */
  otherTab?: boolean;
  /** A read may never be answered. */
  hangs?: boolean;
  /** The member is removed from org-a. */
  removal?: boolean;
  /** The member ends the session. */
  signOut?: boolean;
  /** The member switches to org-b from the switcher. */
  switches?: boolean;
  /** Initial route and server state. */
  active?: OrganizationId;
  routeSlug: string;
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

/** The API as the controller sees it: every call is one atomic step. */
function membershipService(
  world: World,
  sim: Simulation,
  hangs: boolean,
): MembershipService {
  const outcomes = hangs
    ? (['answers', 'fails', 'never answers'] as const)
    : (['answers', 'fails'] as const);
  return {
    async getMyOrganizations() {
      const outcome = await sim.choose('read organizations', outcomes);
      if (outcome === 'never answers') return new Promise(() => undefined);
      if (outcome === 'fails')
        throw Object.assign(new Error('offline'), { isNetworkError: true });
      return summaries(world);
    },
    async switchOrganization(id: string) {
      // The harm is issuing the call once the other tab's switch is known; a
      // call already on the wire cannot be recalled.
      const afterOtherTab = world.eventDelivered;
      world.activations.push({ afterOtherTab, id });
      const outcome = await sim.choose(`activate ${id}`, [
        'answers',
        'fails',
      ] as const);
      if (outcome === 'fails')
        throw Object.assign(new Error('offline'), { isNetworkError: true });
      if (!world.members.includes(id as OrganizationId)) {
        throw Object.assign(new Error('forbidden'), { status: 403 });
      }
      world.active = id as OrganizationId;
      return {};
    },
  };
}

function realTab(world: World, sim: Simulation, options: Options): Tab {
  const service = membershipService(world, sim, options.hangs === true);
  let routeSlug = options.routeSlug;
  const controller = new OrganizationController({
    broadcastChange: () => undefined,
    clearTenantCaches: async () => {
      world.epoch += 1;
    },
    navigate: (href) => {
      world.routeTarget = href.split('/').filter(Boolean)[0] ?? null;
    },
    reportMismatch: () => undefined,
    setProvisionalOrganization: () => undefined,
    setRequestOrganizationId: (id) => {
      world.requestOrganizationId = id;
    },
    wipeDeviceStores: async () => undefined,
  });
  const latest = () =>
    controller.setLatest({
      getMembershipService: async () => service,
      pathname: `/${routeSlug}/overview`,
      routeSlug,
    });
  latest();
  return {
    restart: (restart = {}) => {
      routeSlug = restart.routeSlug ?? routeSlug;
      latest();
      controller.restart({
        bypass: false,
        getMembershipService: async () => service,
        isLoaded: true,
        isSignedIn: restart.isSignedIn ?? true,
        provisional: null,
        routeSlug,
        sessionKey: 'user:session',
      });
    },
    storage: () =>
      controller.handleStorageChange({
        key: ROUTED_ORGANIZATION_STORAGE_KEY,
        newValue: 'changed',
      }),
    switchTo: (id) => {
      void controller.switchOrganization(id);
    },
    view: () => controller.getState(),
  };
}

/**
 * The reconciliation as it stood before #9580 (no check that the generation is
 * still current before activating) and before #9973 (no bound on how long a
 * reconciliation may run). Each flag keeps one of the two fixes.
 */
function legacyTab(
  world: World,
  sim: Simulation,
  options: Options,
  fixes: { guardsActivation: boolean; bounded: boolean },
): Tab {
  const service = membershipService(world, sim, options.hangs === true);
  let routeSlug = options.routeSlug;
  let status: RoutedOrganizationStatus = 'loading';
  let confirmed: string | null = null;
  let generation = 0;
  let queue: Promise<void> = Promise.resolve();

  const bound = <T>(task: Promise<T>): Promise<T> =>
    fixes.bounded ? withConfirmationBound(task) : task;

  const enqueue = (mine: number, run: () => Promise<void>): void => {
    queue = queue
      .catch(() => undefined)
      .then(async () => {
        try {
          await bound(run());
        } catch {
          if (mine === generation) {
            world.requestOrganizationId = null;
            status = 'failed';
            confirmed = null;
          }
        }
      });
  };

  return {
    restart: (restart = {}) => {
      routeSlug = restart.routeSlug ?? routeSlug;
      generation += 1;
      const mine = generation;
      world.requestOrganizationId = null;
      status = 'loading';
      confirmed = null;
      enqueue(mine, async () => {
        world.epoch += 1;
        let organizations = await service.getMyOrganizations();
        const target = organizations.find((org) => org.slug === routeSlug);
        if (!target) {
          if (mine === generation) status = 'unauthorized';
          return;
        }
        if (
          !organizations.some((org) => org.id === target.id && org.isActive)
        ) {
          if (fixes.guardsActivation && mine !== generation) return;
          await service.switchOrganization(target.id);
          world.epoch += 1;
          organizations = await service.getMyOrganizations();
        }
        const active = organizations.find(
          (org) => org.id === target.id && org.isActive,
        );
        if (!active) throw new Error('verification failed');
        if (mine === generation) {
          world.requestOrganizationId = active.id;
          status = 'matched';
          confirmed = active.id;
        }
      });
    },
    storage: () => {
      generation += 1;
      const mine = generation;
      world.requestOrganizationId = null;
      status = 'switching';
      confirmed = null;
      enqueue(mine, async () => {
        world.epoch += 1;
        const organizations = await service.getMyOrganizations();
        if (mine !== generation) return;
        const active = organizations.find((org) => org.isActive);
        if (active?.slug === routeSlug) {
          world.requestOrganizationId = active.id;
          status = 'matched';
          confirmed = active.id;
        } else if (active) {
          world.routeTarget = active.slug;
        }
      });
    },
    view: () => ({
      confirmedOrganizationId: confirmed,
      pendingOrganizationId: null,
      status,
    }),
  };
}

type TabFactory = (world: World, sim: Simulation, options: Options) => Tab;

function scenarioOf(options: Options, makeTab: TabFactory): () => Scenario {
  return () => {
    const world: World = {
      activations: [],
      active: options.active ?? 'org-a',
      epoch: 0,
      eventDelivered: false,
      members: ['org-a', 'org-b'],
      reads: 0,
      requestOrganizationId: null,
      routeTarget: null,
      uses: [],
    };
    let tab: Tab | null = null;
    let started = { navigated: false, removed: false, signedOut: false };
    let routeFollowed = false;
    let switched = false;
    vi.clearAllTimers();
    vi.setSystemTime(0);

    return {
      final: () => {
        const view = tab?.view();
        if (!view) return null;
        if (!SETTLED.includes(view.status)) {
          return `the page ends ${view.status} for ever`;
        }
        return null;
      },
      invariant: () => {
        const view = tab?.view();
        if (!view) return null;
        const expected =
          view.status === 'matched' ? view.confirmedOrganizationId : null;
        if (world.requestOrganizationId !== expected) {
          return `the request organization is ${world.requestOrganizationId} while the page is ${view.status} on ${view.confirmedOrganizationId}`;
        }
        const wrongAnswer = world.uses.find(
          (use) => use.onScreen !== null && use.onScreen !== use.answeredFor,
        );
        if (wrongAnswer) {
          return `an answer for ${wrongAnswer.answeredFor} was used on the page of ${wrongAnswer.onScreen}`;
        }
        const undone = world.activations.find(
          (activation) => activation.afterOtherTab && activation.id !== 'org-b',
        );
        if (undone) {
          return `this tab activated ${undone.id} after another tab's switch reached it`;
        }
        return null;
      },
      snapshot: () =>
        JSON.stringify([
          tab?.view(),
          world.requestOrganizationId,
          world.routeTarget,
          world.active,
          world.members,
          world.epoch,
          world.eventDelivered,
          world.reads,
          world.activations,
          vi.getTimerCount(),
          Date.now(),
          started,
          routeFollowed,
          switched,
          world.uses,
        ]),
      start: (sim) => {
        tab = makeTab(world, sim, options);
        const mounted = tab;
        sim.spawn('tab', async () => {
          mounted.restart();
        });

        if (options.otherTab) {
          sim.spawn('other tab', async () => {
            await sim.step('other tab activates org-b');
            if (world.members.includes('org-b')) world.active = 'org-b';
            await sim.step('the other tab tells this one');
            world.eventDelivered = true;
            mounted.storage();
          });
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
            if (slug) mounted.restart({ routeSlug: slug });
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

        if (options.signOut) {
          sim.environment(
            'the session ends',
            () => !started.signedOut,
            () => {
              started = { ...started, signedOut: true };
              mounted.restart({ isSignedIn: false });
            },
          );
        }

        if (options.navigates) {
          sim.environment(
            'the member opens the other organization',
            () => !started.navigated,
            () => {
              started = { ...started, navigated: true };
              mounted.restart({
                routeSlug: options.routeSlug === 'a' ? 'b' : 'a',
              });
            },
          );
        }

        if (options.switches && mounted.switchTo) {
          const switchTo = mounted.switchTo;
          sim.environment(
            'the member switches to org-b',
            () => !switched && mounted.view().status === 'matched',
            () => {
              switched = true;
              switchTo('org-b');
            },
          );
          sim.environment(
            'the route follows the switch',
            () =>
              switched &&
              !routeFollowed &&
              mounted.view().status === 'switching' &&
              mounted.view().confirmedOrganizationId !== null,
            () => {
              routeFollowed = true;
              mounted.restart({
                routeSlug:
                  SLUG[
                    mounted.view().confirmedOrganizationId as OrganizationId
                  ],
              });
            },
          );
        }

        sim.environment(
          'the shell reads workspace data',
          () => mounted.view().status === 'matched' && world.reads < 2,
          () => {
            world.reads += 1;
            const header = world.requestOrganizationId;
            const epoch = world.epoch;
            void (async () => {
              await sim.step('the workspace answers');
              const refused = header !== null && header !== world.active;
              // A switch cancels what was in flight, with the caches.
              if (refused || epoch !== world.epoch) return;
              const view = mounted.view();
              world.uses.push({
                answeredFor: header ?? world.active,
                onScreen:
                  view.status === 'matched'
                    ? view.confirmedOrganizationId
                    : null,
              });
            })();
          },
        );
      },
    };
  };
}

describe('organization reconciliation, every interleaving', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('holds when another tab switches organization during a hard load', async () => {
    const result = await explore(
      scenarioOf({ otherTab: true, routeSlug: 'a' }, realTab),
    );

    expect(result.violation).toBeNull();
    expect(result.schedules).toBeGreaterThan(20);
  });

  it('holds when the member opens the other organization, or signs out, mid-load', async () => {
    const result = await explore(
      scenarioOf(
        { active: 'org-a', navigates: true, routeSlug: 'b', signOut: true },
        realTab,
      ),
    );

    expect(result.violation).toBeNull();
    expect(result.schedules).toBeGreaterThan(20);
  });

  it('holds when membership is removed and a read never answers', async () => {
    const result = await explore(
      scenarioOf({ hangs: true, removal: true, routeSlug: 'a' }, realTab),
    );

    expect(result.violation).toBeNull();
    expect(result.schedules).toBeGreaterThan(20);
  });

  it('holds when the member switches organization while another tab does', async () => {
    const result = await explore(
      scenarioOf({ otherTab: true, routeSlug: 'a', switches: true }, realTab),
    );

    expect(result.violation).toBeNull();
    expect(result.schedules).toBeGreaterThan(20);
  });

  it('fails on the reconciliation before #9580: it activates after another tab switched', async () => {
    const result = await explore(
      scenarioOf({ otherTab: true, routeSlug: 'a' }, (world, sim, options) =>
        legacyTab(world, sim, options, {
          bounded: true,
          guardsActivation: false,
        }),
      ),
    );

    expect(result.violation).toEqual({
      message: "this tab activated org-a after another tab's switch reached it",
      trace: [
        'other tab: other tab activates org-b',
        'other tab: the other tab tells this one',
        'tab: read organizations -> answers',
      ],
    });
  });

  it('fails on the reconciliation before #9973: a read that never answers holds the page for ever', async () => {
    const result = await explore(
      scenarioOf({ hangs: true, routeSlug: 'a' }, (world, sim, options) =>
        legacyTab(world, sim, options, {
          bounded: false,
          guardsActivation: true,
        }),
      ),
    );

    expect(result.violation).toEqual({
      message: 'the page ends loading for ever',
      trace: ['tab: read organizations -> never answers'],
    });
  });
});
