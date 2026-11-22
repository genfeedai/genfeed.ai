import {
  explore,
  type Scenario,
  type Simulation,
} from '@api-test/model-checking/interleaving-explorer';
import { CredentialPlatform, TargetExecutionState } from '@genfeedai/contracts';
import type { LoggerService } from '@libs/logger/logger.service';
import type { RedisService } from '@libs/redis/redis.service';
import { ScheduledPostSweepLockService } from '@workers/services/scheduled-post-sweep-lock.service';
import { ThreadCommentDeliveryService } from '@workers/services/thread-comment-delivery.service';
import { describe, expect, it, vi } from 'vitest';

/**
 * A delayed thread comment is published by a cron sweep, and during a rolling
 * deploy two workers run that sweep side by side. This model runs the real
 * service twice against a Postgres double and a Redis double whose operations
 * are atomic steps, with the comment deleted at any moment, the sweep lock
 * expiring at any moment and either worker crashing before any step.
 *
 * Harms it rules out:
 * - a comment is published twice;
 * - a comment is published although no claim matched it, which is what a
 *   comment deleted after the list was read looked like.
 *
 * Both are #10792: the stamp was an unconditional update whose count nobody
 * read, and the sweep held no lock, so two workers that read the same list
 * published the same reply twice and a deleted comment still went out.
 */

const ORG = 'org-1';
const PARENT_ID = 'post-1';
const CHILD_ID = 'child-1';

type Row = Record<string, unknown>;

type World = {
  child: Row;
  claims: number;
  published: number;
  /** Lock tokens in the order they were first written; the snapshot names them by position. */
  tokens: string[];
  /** Set when a publish ran with no claim that matched the comment. */
  unclaimedPublish: boolean;
  store: Map<string, string>;
};

const PARENT: Row = {
  brandId: 'brand-1',
  category: 'TEXT',
  createdAt: new Date('2026-09-10T11:00:00.000Z'),
  credentialId: 'cred-1',
  description: 'Parent caption',
  externalId: 'parent-external-1',
  id: PARENT_ID,
  ingredients: [],
  isDeleted: false,
  label: null,
  organizationId: ORG,
  platform: CredentialPlatform.LINKEDIN,
  publishedAt: new Date('2026-09-10T12:00:00.000Z'),
  scheduledDate: new Date('2026-09-10T12:00:00.000Z'),
  targetExecutionState: TargetExecutionState.PUBLISHED,
  targetSettings: {},
  visibility: null,
};

function freshChild(): Row {
  return {
    category: 'TEXT',
    description: 'Delayed comment',
    id: CHILD_ID,
    ingredients: [],
    isDeleted: false,
    lastAttemptAt: null,
    order: 1,
    organizationId: ORG,
    parentId: PARENT_ID,
    retryCount: 0,
    scheduledDate: new Date('2026-09-10T12:10:00.000Z'),
    targetExecutionState: TargetExecutionState.SCHEDULED,
    threadDelayMinutes: 10,
  };
}

/**
 * The part of a Prisma `where` the sweep uses. A filter this model does not
 * know throws, so a changed query shape cannot slip past it unchecked. The
 * `parent` relation is true: the model's parent is published and never changes.
 */
function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, condition]) => {
    if (key === 'AND')
      return (condition as Row[]).every((w) => matches(row, w));
    if (key === 'OR') return (condition as Row[]).some((w) => matches(row, w));
    if (key === 'parent') return true;
    return fieldMatches(row[key], condition, key);
  });
}

function fieldMatches(
  value: unknown,
  condition: unknown,
  key: string,
): boolean {
  if (condition === null || typeof condition !== 'object') {
    return value === condition;
  }
  if (condition instanceof Date) return value === condition;
  return Object.entries(condition as Row).every(([operator, operand]) => {
    const at = (value as Date | number | null | undefined) ?? null;
    switch (operator) {
      case 'not':
        return value !== operand;
      case 'lte':
        return at !== null && at <= (operand as Date | number);
      case 'lt':
        return at !== null && at < (operand as Date | number);
      case 'gt':
        return at !== null && at > (operand as Date | number);
      default:
        throw new Error(
          `The model does not know the filter ${key}.${operator}.`,
        );
    }
  });
}

function prismaDouble(sim: Simulation, world: World) {
  const rows = (): Row[] => [world.child];
  return {
    post: {
      /** Earlier siblings: the model has one comment, so none. */
      count: async () => 0,
      findFirst: async ({ where }: { where: Row }) => {
        if (where.id === PARENT_ID) return { ...PARENT };
        return null;
      },
      findMany: async ({ where }: { where: Row }) => {
        await sim.step('postgres SELECT due comments');
        const found = rows()
          .filter((row) => matches(row, where))
          .map((row) => ({ ...row }));
        sim.observed(found.map((row) => row.id));
        return found;
      },
      updateMany: async ({ data, where }: { data: Row; where: Row }) => {
        await sim.step('postgres UPDATE comment');
        const hit = rows().filter((row) => matches(row, where));
        for (const row of hit) {
          if ('retryCount' in data) {
            world.claims += 1;
            row.lastAttemptAt = new Date();
            row.retryCount = Number(row.retryCount) + 1;
          } else {
            Object.assign(row, data);
          }
        }
        sim.observed(hit.length);
        return { count: hit.length };
      },
    },
  };
}

const LOCK_TTL_MARKER = 'PEXPIRE';

function redisDouble(sim: Simulation, world: World) {
  const reply = <T>(value: T): T => {
    sim.observed(value);
    return value;
  };
  return {
    eval: async (script: string, _keys: number, key: string, token: string) => {
      const extend = script.includes(LOCK_TTL_MARKER);
      await sim.step(`redis EVAL ${extend ? 'extend' : 'release'} lock`);
      if (world.store.get(key) !== token) return reply(0);
      if (!extend) world.store.delete(key);
      return reply(1);
    },
    set: async (key: string, token: string) => {
      await sim.step(`redis SET NX ${key}`);
      if (world.store.has(key)) return reply(null);
      world.store.set(key, token);
      world.tokens.push(token);
      return reply('OK');
    },
  };
}

function publisherDouble(sim: Simulation, world: World) {
  return {
    publishThreadChildren: async () => {
      await sim.step('provider posts the reply');
      if (world.child.isDeleted === true) return;
      if (world.claims === 0) world.unclaimedPublish = true;
      world.published += 1;
      world.child.targetExecutionState = TargetExecutionState.PUBLISHED;
    },
    supportsThreads: true,
  };
}

type Sweep = () => Promise<unknown>;

/** Two workers sweep at once, then a third tick once both ended. */
function threadCommentScenario(
  makeSweep: (sim: Simulation, world: World) => Sweep,
): () => Scenario {
  return () => {
    const world: World = {
      child: freshChild(),
      claims: 0,
      published: 0,
      store: new Map(),
      tokens: [],
      unclaimedPublish: false,
    };
    return {
      invariant: () => {
        if (world.published > 1) return 'the comment was published twice';
        if (world.unclaimedPublish) {
          return 'a comment was published although no claim matched it';
        }
        return null;
      },
      // Timestamps and random lock tokens differ in every run for no reason the
      // sweep can see, so the snapshot keeps only what the sweep tests.
      snapshot: () =>
        JSON.stringify([
          [...world.store.entries()].map(([key, token]) => [
            key,
            world.tokens.indexOf(token),
          ]),
          [
            world.child.isDeleted,
            world.child.targetExecutionState,
            world.child.retryCount,
            world.child.lastAttemptAt !== null,
          ],
          world.claims,
          world.published,
          world.unclaimedPublish,
        ]),
      start: (sim) => {
        sim.environment(
          'the comment is deleted',
          () =>
            world.child.isDeleted === false &&
            world.child.targetExecutionState === TargetExecutionState.SCHEDULED,
          () => {
            world.child.isDeleted = true;
          },
        );
        sim.environment(
          'the sweep lock expires',
          () => world.store.size > 0,
          () => world.store.clear(),
        );
        const sweep = makeSweep(sim, world);
        sim.spawn('worker 1', sweep, { crashable: true });
        sim.spawn('worker 2', sweep, { crashable: true });
        sim.onQuiescence(() => sim.spawn('later tick', sweep));
      },
    };
  };
}

function realService(sim: Simulation, world: World): Sweep {
  const redis = redisDouble(sim, world);
  const quiet = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };
  const logger = quiet as unknown as LoggerService;
  const lock = new ScheduledPostSweepLockService(
    { getPublisher: () => redis } as unknown as RedisService,
    logger,
  );
  const service = new ThreadCommentDeliveryService(
    logger,
    prismaDouble(sim, world) as never,
    { findOne: async () => ({ id: ORG }) } as never,
    { findOne: async () => ({ id: 'cred-1' }) } as never,
    { getPublisher: () => publisherDouble(sim, world) } as never,
    lock,
  );
  return () => service.publishDueThreadComments();
}

/**
 * The sweep before #10792 (9d7226a7b^): no lock, and the stamp is an
 * unconditional update whose count is not read before the comment is
 * published.
 */
function sweepBefore10792(sim: Simulation, world: World): Sweep {
  const prisma = prismaDouble(sim, world);
  const publisher = publisherDouble(sim, world);
  return async () => {
    const backoffThreshold = new Date(Date.now() - 60_000);
    const due = (await prisma.post.findMany({
      where: {
        AND: [
          { targetExecutionState: TargetExecutionState.SCHEDULED },
          {
            OR: [
              { lastAttemptAt: null },
              { lastAttemptAt: { lte: backoffThreshold } },
            ],
          },
        ],
        isDeleted: false,
        parent: { is: {} },
        parentId: { not: null },
        scheduledDate: { lte: new Date('2026-09-10T13:00:00.000Z') },
        threadDelayMinutes: { gt: 0 },
      },
    })) as Row[];
    for (const child of due) {
      await prisma.post.updateMany({
        data: { lastAttemptAt: new Date(), retryCount: { increment: 1 } },
        where: { id: child.id, isDeleted: false, organizationId: ORG },
      });
      await publisher.publishThreadChildren();
    }
  };
}

describe('Delayed thread comment sweep, every interleaving', () => {
  it('publishes a comment at most once and only after a claim matched it', async () => {
    const result = await explore(threadCommentScenario(realService));

    expect(result.violation).toBeNull();
    expect(result.schedules).toBeGreaterThan(1000);
  });

  it('fails on the sweep the workers ran before #10792', async () => {
    const result = await explore(threadCommentScenario(sweepBefore10792));

    expect(result.violation).toEqual({
      message: 'the comment was published twice',
      trace: [
        'worker 1: postgres SELECT due comments',
        'worker 2: postgres SELECT due comments',
        'worker 1: postgres UPDATE comment',
        'worker 2: postgres UPDATE comment',
        'worker 1: provider posts the reply',
        'worker 2: provider posts the reply',
      ],
    });
  });
});
