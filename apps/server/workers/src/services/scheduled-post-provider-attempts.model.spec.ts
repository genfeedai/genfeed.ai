vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

import type { PostEntity } from '@api/collections/posts/entities/post.entity';
import type { PublishResult } from '@api/index';
import {
  explore,
  type Scenario,
  type Simulation,
} from '@api-test/model-checking/interleaving-explorer';
import { TargetExecutionState } from '@genfeedai/contracts';
import type { LoggerService } from '@libs/logger/logger.service';
import type { PrismaService } from '@libs/prisma/prisma.service';
import type { PreparedPostDelivery } from '@workers/services/scheduled-post-delivery.types';
import { ScheduledPostProviderAttempts } from '@workers/services/scheduled-post-provider-attempts';
import {
  PROVIDER_PUBLISH_ATTEMPT_LEASE_MS,
  type ProviderPublishAttemptRef,
} from '@workers/services/scheduled-post-provider-receipt.util';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A scheduled post reaches the provider once per occurrence. Two deliveries can
 * run side by side, a delivery can crash after the provider took the post, a
 * provider call can stall past the lease, and a later delivery meets whatever
 * attempt the earlier ones left. This model runs the real attempt lifecycle
 * (reserve, verify an unconfirmed attempt, confirm ownership, call the provider
 * under a renewed lease, accept) against a receipt table whose every statement
 * is an atomic step, with the clock passing at any moment.
 *
 * Harm it rules out: the provider is called twice for one occurrence.
 *
 * A publisher that cannot verify an earlier attempt is only retried blind while
 * the retry budget lasts, and that duplicate is the stated price of retrying.
 * The model fixes the budget at spent, so a retry after an unconfirmed attempt
 * must not reach the provider.
 *
 * Assumptions, stated so they are not mistaken for proofs:
 * - a statement takes effect before the lease clock moves on: the helpers stamp
 *   it with the time it is sent, so a database that holds one for a whole lease
 *   is an outage the lease cannot survive. A delivery that stalls before it
 *   sends a statement (its gates, a slow provider call) is explored;
 * - one occurrence, one provider, and no past fix to replay: the protocol was
 *   built with its guards, so the proof that the model looks is a mutation of
 *   each guard (ownership confirmation, the lease check on takeover, the
 *   renewal during the call, the spent retry budget), listed in the pull
 *   request.
 */

const START = new Date('2026-11-22T12:00:00.000Z');
const ORG = 'org-1';
const POST_ID = 'post-1';
const CLOCK_STEP_MS = PROVIDER_PUBLISH_ATTEMPT_LEASE_MS / 2;
/** Two leases: long enough for any attempt to expire and be taken over. */
const CLOCK_LIMIT_MS = PROVIDER_PUBLISH_ATTEMPT_LEASE_MS * 2;
const UNIQUE_CONFLICT = { code: 'P2002' };

type Row = {
  attemptStartedAt: Date;
  attemptToken: string;
  externalId: string | null;
  id: string;
  isDeleted: boolean;
  leaseRenewedAt: Date;
  occurrenceKey: string;
  organizationId: string;
  persistedAt: Date | null;
  postId: string;
  result: unknown;
  status: string;
  workflowExecutionId: string;
};

type World = {
  /** The second delivery of the clock variants has started. */
  hasSecondDelivery: boolean;
  /** Statements sent to the table and not yet answered. */
  statementsInFlight: number;
  /** Lease tokens in the order first written; the snapshot names them by position. */
  tokens: string[];
  posts: number;
  row: Row | null;
};

type Where = Record<string, unknown>;

const POST = {
  description: 'A scheduled post',
  id: POST_ID,
  ingredients: [],
  organizationId: ORG,
  publishApprovalId: 'approval-1',
  reviewVersionPinId: 'pin-1',
  scheduledDate: new Date('2026-11-22T11:00:00.000Z'),
} as unknown as PostEntity;

const ACCEPTED: PublishResult = {
  executionState: TargetExecutionState.PUBLISHED,
  externalId: 'external-1',
  platform: 'linkedin',
  success: true,
  url: '',
};

function elapsedMs(): number {
  return Date.now() - START.getTime();
}

/** The part of a Prisma `where` the receipt helpers use; any other filter throws. */
function matches(row: Row, where: Where): boolean {
  return Object.entries(where).every(([key, wanted]) => {
    const actual = (row as unknown as Where)[key];
    if (
      wanted !== null &&
      typeof wanted === 'object' &&
      !(wanted instanceof Date)
    ) {
      return Object.entries(wanted as Where).every(([operator, operand]) => {
        if (operator === 'lt') return (actual as Date) < (operand as Date);
        throw new Error(
          `The model does not know the filter ${key}.${operator}.`,
        );
      });
    }
    return actual === wanted;
  });
}

/** `Prisma.DbNull` and friends are markers for a null column in an update. */
function plainData(data: Record<string, unknown>): Partial<Row> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    const isMarker =
      value !== null &&
      typeof value === 'object' &&
      !(value instanceof Date) &&
      Object.keys(value).length === 0;
    out[key] = isMarker ? null : value;
  }
  return out as Partial<Row>;
}

function noteToken(world: World, token: unknown): void {
  if (typeof token === 'string' && !world.tokens.includes(token)) {
    world.tokens.push(token);
  }
}

function receiptTable(sim: Simulation, world: World) {
  return {
    postProviderPublishReceipt: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        world.statementsInFlight += 1;
        await sim.step('postgres INSERT receipt');
        world.statementsInFlight -= 1;
        if (world.row !== null) {
          sim.observed('conflict');
          throw UNIQUE_CONFLICT;
        }
        noteToken(world, data.attemptToken);
        world.row = {
          externalId: null,
          id: 'receipt-1',
          isDeleted: false,
          persistedAt: null,
          result: null,
          ...data,
        } as Row;
        sim.observed('inserted');
        return { id: 'receipt-1' };
      },
      findFirst: async ({ where }: { where: Where }) => {
        world.statementsInFlight += 1;
        await sim.step('postgres SELECT receipt');
        world.statementsInFlight -= 1;
        const found =
          world.row && matches(world.row, where) ? { ...world.row } : null;
        sim.observed(
          found
            ? [found.status, world.tokens.indexOf(found.attemptToken)]
            : null,
        );
        return found;
      },
      updateMany: async ({
        data,
        where,
      }: {
        data: Record<string, unknown>;
        where: Where;
      }) => {
        const isRenewal =
          Object.keys(data).length === 1 && 'leaseRenewedAt' in data;
        world.statementsInFlight += 1;
        await sim.step(
          isRenewal ? 'postgres UPDATE renew lease' : 'postgres UPDATE receipt',
        );
        world.statementsInFlight -= 1;
        const hit = world.row !== null && matches(world.row, where);
        if (hit && world.row) {
          noteToken(world, data.attemptToken);
          Object.assign(world.row, plainData(data));
        }
        sim.observed(hit ? 1 : 0);
        return { count: hit ? 1 : 0 };
      },
    },
  } as unknown as PrismaService;
}

type Delivery = (actor: string) => Promise<void>;

type Variant = { isVerifiable: boolean; isConcurrent: boolean };

function prepared(sim: Simulation, world: World, variant: Variant) {
  return {
    context: {},
    publisher: variant.isVerifiable
      ? {
          verifyPublished: async (): Promise<PublishResult | null> => {
            await sim.step('provider lists the recent posts');
            return world.posts > 0 ? ACCEPTED : null;
          },
        }
      : {},
  } as unknown as PreparedPostDelivery;
}

/**
 * The provider call. It lands, and then either answers or the answer is lost;
 * a lost answer is the timeout whose outcome nobody can see.
 */
function providerCall(sim: Simulation, world: World) {
  return async (): Promise<PublishResult> => {
    const answer = await sim.choose('provider takes the post', [
      'answers',
      'answer lost',
    ] as const);
    world.posts += 1;
    if (answer === 'answer lost') throw new Error('socket hang up');
    return ACCEPTED;
  };
}

/**
 * What `ScheduledPostDeliveryService.publishReservedAttempt` and `callProvider`
 * do with the attempt, reduced to the calls on the attempt lifecycle.
 */
function realDelivery(
  sim: Simulation,
  world: World,
  variant: Variant,
): Delivery {
  const logger = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };
  const attempts = new ScheduledPostProviderAttempts(
    receiptTable(sim, world),
    logger as unknown as LoggerService,
  );
  return async (actor) => {
    const executionId = `execution of ${actor}`;
    const reserved = await attempts.reserve(POST, executionId);
    let attempt: ProviderPublishAttemptRef;
    if (reserved.kind === 'publish') {
      attempt = reserved;
    } else if (reserved.kind === 'unconfirmed') {
      const resolved = await attempts.resolveUnconfirmed(
        POST,
        prepared(sim, world, variant),
        reserved,
        executionId,
        'model',
        false,
      );
      if (resolved.kind !== 'publish') return;
      attempt = resolved;
    } else {
      return;
    }
    await sim.step('the delivery runs its gates');
    if (!(await attempts.confirmOwnership(POST, attempt))) return;
    try {
      const result = await attempts.publishUnderLease(
        POST,
        attempt,
        'model',
        providerCall(sim, world),
      );
      await attempts.accept(POST, attempt, result, 'model');
    } catch {
      await attempts.settle(POST, attempt, 'uncertain', 'model');
    }
  };
}

function deliveryScenario(
  makeDelivery: (sim: Simulation, world: World, variant: Variant) => Delivery,
  variant: Variant,
): () => Scenario {
  return () => {
    vi.clearAllTimers();
    vi.setSystemTime(START);
    const world: World = {
      hasSecondDelivery: false,
      posts: 0,
      statementsInFlight: 0,
      row: null,
      tokens: [],
    };
    return {
      invariant: () =>
        world.posts > 1 ? 'the provider was called twice for one post' : null,
      // Timestamps and random lease tokens differ in every run for no reason
      // the protocol can see, so the snapshot keeps the clock as an offset and
      // names each token by its position.
      snapshot: () =>
        JSON.stringify([
          world.row === null
            ? null
            : [
                world.row.status,
                world.tokens.indexOf(world.row.attemptToken),
                world.row.leaseRenewedAt.getTime() - START.getTime(),
                world.row.attemptStartedAt.getTime() - START.getTime(),
                world.row.result !== null,
              ],
          world.posts,
          world.hasSecondDelivery,
          elapsedMs(),
          vi.getTimerCount(),
        ]),
      start: (sim) => {
        const delivery = makeDelivery(sim, world, variant);
        sim.spawn('delivery 1', () => delivery('delivery 1'), {
          crashable: true,
        });
        if (variant.isConcurrent) {
          sim.spawn('delivery 2', () => delivery('delivery 2'));
          return;
        }
        // A statement is stamped with the clock when it is sent, so one that a
        // stalled database holds for a whole lease is an outage, not a
        // schedule: the clock waits for the statements in flight. A delivery
        // that stalls before it sends one (its gates, a slow provider) is a
        // schedule, and has a step of its own.
        sim.environment(
          'the clock passes',
          () => elapsedMs() < CLOCK_LIMIT_MS && world.statementsInFlight === 0,
          () => {
            vi.advanceTimersByTime(CLOCK_STEP_MS);
          },
        );
        // The second delivery is a sweep that starts once the first one's lease
        // would have lapsed had it not been renewed.
        sim.environment(
          'a second delivery starts',
          () =>
            !world.hasSecondDelivery &&
            elapsedMs() > PROVIDER_PUBLISH_ATTEMPT_LEASE_MS,
          () => {
            world.hasSecondDelivery = true;
            sim.spawn('delivery 2', () => delivery('delivery 2'));
          },
        );
        sim.onQuiescence(() =>
          sim.spawn('later delivery', () => delivery('later delivery')),
        );
      },
    };
  };
}

describe('Provider publish attempt, every interleaving', () => {
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: [
        'Date',
        'setInterval',
        'clearInterval',
        'setTimeout',
        'clearTimeout',
      ],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    ['two deliveries at once', { isConcurrent: true, isVerifiable: false }],
    [
      'a publisher that verifies an unconfirmed attempt',
      { isConcurrent: false, isVerifiable: true },
    ],
    [
      'a publisher that cannot verify',
      { isConcurrent: false, isVerifiable: false },
    ],
  ])('calls the provider at most once for %s', async (_label, variant) => {
    const result = await explore(deliveryScenario(realDelivery, variant));

    expect(result.violation).toBeNull();
    expect(result.schedules).toBeGreaterThan(50);
  });
});
