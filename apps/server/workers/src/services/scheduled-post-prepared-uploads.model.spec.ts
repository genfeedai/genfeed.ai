vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

import type { PostEntity } from '@api/collections/posts/entities/post.entity';
import type { PreparedProviderUpload, PublishResult } from '@api/index';
import {
  PostPreparedUploadStatus,
  PublishErrorKind,
  TargetExecutionState,
} from '@genfeedai/contracts';
import { PublishError } from '@genfeedai/contracts/interfaces';
import {
  explore,
  type Scenario,
  type Simulation,
} from '@genfeedai/utils/model-checking/interleaving-explorer';
import type { LoggerService } from '@libs/logger/logger.service';
import type { PrismaService } from '@libs/prisma/prisma.service';
import type { PreparedPostDelivery } from '@workers/services/scheduled-post-delivery.types';
import { PREPARED_UPLOAD_LEASE_MS } from '@workers/services/scheduled-post-prepared-upload.util';
import { ScheduledPostPreparedUploads } from '@workers/services/scheduled-post-prepared-uploads';
import { ScheduledPostProviderAttempts } from '@workers/services/scheduled-post-provider-attempts';
import {
  occurrenceScope,
  PROVIDER_PUBLISH_ATTEMPT_LEASE_MS,
  type ProviderPublishAttemptRef,
} from '@workers/services/scheduled-post-provider-receipt.util';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * An Instagram post's container is created a few minutes before the post is
 * due and published at the due time. Three actors meet over it: the prepare
 * sweep that creates the container, the delivery that publishes, and the owner
 * who edits the post in between. A sweep or a delivery can crash at any step,
 * a provider answer can be lost, and the clock can pass so a dead holder's
 * lease expires and a later run takes over. This model runs the real prepare
 * (`uploadAhead`) and the real provider call (`publish`) with the real
 * attempt lifecycle, against an upload table and a receipt table whose every
 * statement is an atomic step.
 *
 * Harms it rules out:
 * - a container is passed to `media_publish` twice;
 * - a container made for content the owner since edited is published;
 * - a post goes out twice for one occurrence.
 *
 * Assumptions, stated so they are not mistaken for proofs:
 * - one post, one account, and verification that sees every landed post (the
 *   verification lag is the receipt model's subject, not this one's);
 * - a statement takes effect before the clock moves on, as in
 *   `scheduled-post-provider-attempts.model.spec.ts`;
 * - no past bug to replay: the protocol is new, so the proof that the model
 *   looks is the broken take below, which ignores the occurrence key, and the
 *   mutations listed in the pull request.
 */

const START = new Date('2026-11-27T11:55:00.000Z');
const ORG = 'org-1';
const UNIQUE_CONFLICT = { code: 'P2002' };
/** Two receipt leases: any dead holder's lease lapses and is taken over. */
const CLOCK_LIMIT_MS = PROVIDER_PUBLISH_ATTEMPT_LEASE_MS * 2;

type Row = Record<string, unknown> & {
  id: string;
  occurrenceKey: string;
};

type Container = { content: string; id: string; publishes: number };

type World = {
  content: string;
  containers: Container[];
  /** Post contents Instagram shows, one entry per published post. */
  posts: string[];
  receipts: Row[];
  statementsInFlight: number;
  tokens: string[];
  uploads: Row[];
  hasSecondPrepare: boolean;
  violation: string | null;
};

type Where = Record<string, unknown>;

const BASE_POST = {
  id: 'post-1',
  ingredients: [{ id: 'image-1' }, { id: 'image-2' }],
  organizationId: ORG,
  publishApprovalId: 'approval-1',
  reviewVersionPinId: 'pin-1',
  scheduledDate: new Date('2026-11-27T12:00:00.000Z'),
};

const ACCEPTED: PublishResult = {
  executionState: TargetExecutionState.PUBLISHED,
  externalId: 'media-1',
  platform: 'instagram',
  success: true,
  url: '',
};

function elapsedMs(): number {
  return Date.now() - START.getTime();
}

function compare(actual: unknown, operator: string, operand: unknown): boolean {
  const left = actual instanceof Date ? actual.getTime() : Number.NaN;
  const right = operand instanceof Date ? operand.getTime() : Number.NaN;
  if (operator === 'lt') return left < right;
  if (operator === 'gt') return left > right;
  throw new Error(`The model does not know the filter operator ${operator}.`);
}

/** The part of a Prisma `where` the helpers use; any other filter throws. */
function matches(row: Row, where: Where): boolean {
  return Object.entries(where).every(([key, wanted]) => {
    const actual = row[key];
    if (
      wanted !== null &&
      typeof wanted === 'object' &&
      !(wanted instanceof Date)
    ) {
      return Object.entries(wanted as Where).every(([operator, operand]) =>
        compare(actual, operator, operand),
      );
    }
    return actual === wanted;
  });
}

/** `Prisma.DbNull` and friends are markers for a null column in an update. */
function plainData(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    const isMarker =
      value !== null &&
      typeof value === 'object' &&
      !(value instanceof Date) &&
      Object.keys(value).length === 0;
    out[key] = isMarker ? null : value;
  }
  return out;
}

function noteTokens(world: World, data: Record<string, unknown>): void {
  for (const key of ['attemptToken', 'leaseToken', 'consumedByAttempt']) {
    const token = data[key];
    if (typeof token === 'string' && !world.tokens.includes(token)) {
      world.tokens.push(token);
    }
  }
}

/** One table of single-statement steps, keyed by occurrence like the real index. */
function table(sim: Simulation, world: World, rows: () => Row[], name: string) {
  return {
    create: async ({ data }: { data: Record<string, unknown> }) => {
      world.statementsInFlight += 1;
      await sim.step(`postgres INSERT ${name}`);
      world.statementsInFlight -= 1;
      if (rows().some((row) => row.occurrenceKey === data.occurrenceKey)) {
        sim.observed('conflict');
        throw UNIQUE_CONFLICT;
      }
      noteTokens(world, data);
      const id = `${name}-${rows().length + 1}`;
      rows().push({
        consumedByAttempt: null,
        expiresAt: null,
        externalId: null,
        isDeleted: false,
        persistedAt: null,
        providerUploadId: null,
        result: null,
        ...data,
        id,
      } as unknown as Row);
      sim.observed('inserted');
      return { id };
    },
    findFirst: async ({ where }: { where: Where }) => {
      world.statementsInFlight += 1;
      await sim.step(`postgres SELECT ${name}`);
      world.statementsInFlight -= 1;
      const found = rows().find((row) => matches(row, where));
      sim.observed(found ? [found.id, found.status] : null);
      return found ? { ...found } : null;
    },
    updateMany: async ({
      data,
      where,
    }: {
      data: Record<string, unknown>;
      where: Where;
    }) => {
      world.statementsInFlight += 1;
      await sim.step(`postgres UPDATE ${name}`);
      world.statementsInFlight -= 1;
      const hit = rows().find((row) => matches(row, where));
      if (hit) {
        noteTokens(world, data);
        Object.assign(hit, plainData(data));
      }
      sim.observed(hit ? 1 : 0);
      return { count: hit ? 1 : 0 };
    },
  };
}

function database(sim: Simulation, world: World): PrismaService {
  return {
    postPreparedUpload: table(sim, world, () => world.uploads, 'upload'),
    postProviderPublishReceipt: table(
      sim,
      world,
      () => world.receipts,
      'receipt',
    ),
  } as unknown as PrismaService;
}

function lost(): PublishError {
  return new PublishError(PublishErrorKind.OUTCOME_UNKNOWN, 'socket hang up');
}

/** Instagram, reduced to what the publisher's two steps and verification do. */
function instagram(sim: Simulation, world: World) {
  const land = (content: string) => {
    world.posts.push(content);
  };
  return {
    platform: 'instagram',
    prepareUpload: async (context: {
      post: { description: string };
    }): Promise<PreparedProviderUpload> => {
      await sim.step('instagram creates the container');
      const container = {
        content: context.post.description,
        id: `container-${world.containers.length + 1}`,
        publishes: 0,
      };
      world.containers.push(container);
      return {
        expiresAt: new Date(Date.now() + 10 * 60_000),
        providerUploadId: container.id,
      };
    },
    publishPrepared: async (
      context: { post: { description: string } },
      upload: PreparedProviderUpload,
    ): Promise<PublishResult> => {
      const answer = await sim.choose('instagram media_publish', [
        'answers',
        'answer lost',
        'refuses the container',
      ] as const);
      const container = world.containers.find(
        (candidate) => candidate.id === upload.providerUploadId,
      );
      if (!container) throw new Error('unknown container');
      if (answer === 'refuses the container') {
        throw new PublishError(
          PublishErrorKind.CONTENT_REJECTED,
          'container expired',
        );
      }
      container.publishes += 1;
      if (container.publishes > 1) {
        world.violation = `${container.id} was published twice`;
      }
      if (container.content !== context.post.description) {
        world.violation = `${container.id} made for "${container.content}" was published for "${context.post.description}"`;
      }
      land(container.content);
      if (answer === 'answer lost') throw lost();
      return ACCEPTED;
    },
    publish: async (context: {
      post: { description: string };
    }): Promise<PublishResult> => {
      const answer = await sim.choose('instagram uploads and publishes', [
        'answers',
        'answer lost',
      ] as const);
      land(context.post.description);
      if (answer === 'answer lost') throw lost();
      return ACCEPTED;
    },
    verifyPublished: async (context: {
      post: { description: string };
    }): Promise<PublishResult | null> => {
      await sim.step('instagram lists the recent posts');
      return world.posts.includes(context.post.description) ? ACCEPTED : null;
    },
  };
}

type Take = ScheduledPostPreparedUploads['publish'];

type Actors = {
  delivery: (actor: string) => Promise<void>;
  prepare: () => Promise<void>;
};

function actors(
  sim: Simulation,
  world: World,
  brokenTake: ((uploads: ScheduledPostPreparedUploads) => Take) | null,
): Actors {
  const logger = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } as unknown as LoggerService;
  const prisma = database(sim, world);
  const uploads = new ScheduledPostPreparedUploads(
    prisma,
    logger,
    {} as never,
    {} as never,
  );
  const attempts = new ScheduledPostProviderAttempts(prisma, logger);
  const publisher = instagram(sim, world);
  const publish = brokenTake ? brokenTake(uploads) : uploads.publish;

  const load = async (actor: string) => {
    await sim.step(`${actor} loads the post`);
    sim.observed(world.content);
    const post = {
      ...BASE_POST,
      description: world.content,
    } as unknown as PostEntity;
    const delivery = {
      context: {
        credential: { externalId: 'ig-1', id: 'credential-1' },
        organizationId: ORG,
        post,
        postId: BASE_POST.id,
        settings: {},
      },
      credential: {},
      platform: 'instagram',
      publisher,
    } as unknown as PreparedPostDelivery;
    return { delivery, post };
  };

  return {
    prepare: async () => {
      const { delivery, post } = await load('prepare sweep');
      await uploads.uploadAhead(post, delivery, 'model');
    },
    /**
     * What `ScheduledPostDeliveryService.publishReservedAttempt` and
     * `callProvider` do, reduced to the attempt lifecycle and the call.
     */
    delivery: async (actor) => {
      const { delivery, post } = await load(actor);
      const executionId = `execution of ${actor}`;
      const reserved = await attempts.reserve(post, executionId);
      let attempt: ProviderPublishAttemptRef;
      if (reserved.kind === 'publish') {
        attempt = reserved;
      } else if (reserved.kind === 'unconfirmed') {
        const resolved = await attempts.resolveUnconfirmed(
          post,
          delivery,
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
      if (!(await attempts.confirmOwnership(post, attempt))) return;
      try {
        const result = await attempts.publishUnderLease(
          post,
          attempt,
          'model',
          () => publish.call(uploads, post, delivery, attempt, 'model'),
        );
        await attempts.accept(post, attempt, result, 'model');
      } catch (error: unknown) {
        const isUncertain =
          error instanceof PublishError &&
          error.kind === PublishErrorKind.OUTCOME_UNKNOWN;
        await attempts.settle(
          post,
          attempt,
          isUncertain ? 'uncertain' : 'released',
          'model',
        );
      }
    },
  };
}

/**
 * - `edit`: sweep, delivery and the owner's edit run side by side, and either
 *   run can crash at any step.
 * - `delivery crash`: a delivery dies anywhere, between taking the container
 *   and media_publish included, and a retry runs once its lease lapsed.
 * - `prepare crash`: a sweep dies mid-upload and the next one takes over.
 */
type Variant = 'edit' | 'delivery crash' | 'prepare crash';

function scenario(
  variant: Variant,
  brokenTake: ((uploads: ScheduledPostPreparedUploads) => Take) | null = null,
): () => Scenario {
  return () => {
    vi.clearAllTimers();
    vi.setSystemTime(START);
    const world: World = {
      containers: [],
      content: 'Golden hour',
      hasSecondPrepare: false,
      posts: [],
      receipts: [],
      statementsInFlight: 0,
      tokens: [],
      uploads: [],
      violation: null,
    };
    const token = (value: unknown) =>
      typeof value === 'string' ? world.tokens.indexOf(value) : null;
    const time = (value: unknown) =>
      value instanceof Date ? value.getTime() - START.getTime() : null;
    return {
      invariant: () => {
        if (world.violation) return world.violation;
        const counts = new Map<string, number>();
        for (const post of world.posts) {
          counts.set(post, (counts.get(post) ?? 0) + 1);
        }
        for (const [content, count] of counts) {
          if (count > 1) return `"${content}" went out ${count} times`;
        }
        return null;
      },
      // Timestamps and random tokens differ in every run for no reason the
      // protocol can see, so the clock is an offset and tokens are positions.
      snapshot: () =>
        JSON.stringify([
          world.uploads.map((row) => [
            row.occurrenceKey,
            row.status,
            token(row.leaseToken),
            time(row.leaseRenewedAt),
            row.providerUploadId,
            token(row.consumedByAttempt),
          ]),
          world.receipts.map((row) => [
            row.occurrenceKey,
            row.status,
            token(row.attemptToken),
            time(row.leaseRenewedAt),
            time(row.attemptStartedAt),
            row.result !== null,
          ]),
          world.containers,
          world.posts,
          world.content,
          world.hasSecondPrepare,
          elapsedMs(),
          vi.getTimerCount(),
        ]),
      start: (sim) => {
        const run = actors(sim, world, brokenTake);
        const clock = (stepMs: number, limitMs: number) =>
          sim.environment(
            'the clock passes',
            () => elapsedMs() < limitMs && world.statementsInFlight === 0,
            () => {
              vi.advanceTimersByTime(stepMs);
            },
          );
        if (variant === 'edit') {
          sim.spawn('prepare sweep', run.prepare, { crashable: true });
          sim.spawn('delivery', () => run.delivery('delivery'), {
            crashable: true,
          });
          sim.spawn('owner', async () => {
            await sim.step('owner edits the caption');
            world.content = 'Golden hour, edited';
          });
        }
        if (variant === 'delivery crash') {
          // The container is ready; the delivery may die between taking it
          // and media_publish, and its lease must lapse before a retry.
          sim.spawn('prepare sweep', run.prepare);
          sim.onQuiescence(() => {
            sim.spawn('delivery', () => run.delivery('delivery'), {
              crashable: true,
            });
            clock(PROVIDER_PUBLISH_ATTEMPT_LEASE_MS / 2, CLOCK_LIMIT_MS);
          });
        }
        if (variant === 'prepare crash') {
          // A sweep dies mid-upload; the next one takes the row over once
          // the lease lapsed, and the dead one's container is never used.
          sim.spawn('prepare sweep', run.prepare, { crashable: true });
          clock(PREPARED_UPLOAD_LEASE_MS, PREPARED_UPLOAD_LEASE_MS * 2);
          sim.environment(
            'the next prepare sweep starts',
            () =>
              !world.hasSecondPrepare &&
              elapsedMs() >= PREPARED_UPLOAD_LEASE_MS,
            () => {
              world.hasSecondPrepare = true;
              sim.spawn('next prepare sweep', run.prepare);
            },
          );
          sim.onQuiescence(() =>
            sim.spawn('delivery', () => run.delivery('delivery')),
          );
        }
        sim.onQuiescence(() =>
          sim.spawn('retry delivery', () => run.delivery('retry delivery')),
        );
      },
    };
  };
}

/**
 * A take that finds the post's ready upload without its occurrence key, as a
 * lookup by post id alone would: an upload made before an edit is published
 * for the edited post.
 */
function takeIgnoringOccurrence(uploads: ScheduledPostPreparedUploads): Take {
  return async function (this: ScheduledPostPreparedUploads, ...args) {
    const [post, delivery, attempt] = args;
    const prisma = (uploads as unknown as { prisma: PrismaService }).prisma;
    const { organizationId, postId } = occurrenceScope(post);
    const row = await prisma.postPreparedUpload.findFirst({
      where: {
        organizationId,
        postId,
        status: PostPreparedUploadStatus.READY,
      },
    });
    if (!row?.providerUploadId || !row.expiresAt) {
      return delivery.publisher.publish(delivery.context);
    }
    const taken = await prisma.postPreparedUpload.updateMany({
      where: { id: row.id, status: PostPreparedUploadStatus.READY },
      data: {
        consumedByAttempt: attempt.attemptToken,
        status: PostPreparedUploadStatus.CONSUMED,
      },
    });
    if (taken.count !== 1 || !delivery.publisher.publishPrepared) {
      return delivery.publisher.publish(delivery.context);
    }
    return delivery.publisher.publishPrepared(delivery.context, {
      expiresAt: row.expiresAt,
      providerUploadId: row.providerUploadId,
    });
  };
}

describe('Instagram upload ahead of the due time, every interleaving', () => {
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
    ['an edit between the sweep and the delivery', 'edit'],
    ['a crash between the two steps, then a retry', 'delivery crash'],
    ['a sweep that dies mid-upload', 'prepare crash'],
  ] as const)(
    'publishes each container at most once, never stale, for %s',
    { timeout: 600_000 },
    async (_label, variant) => {
      const result = await explore(scenario(variant));

      expect(result.violation).toBeNull();
      expect(result.schedules).toBeGreaterThan(50);
    },
  );

  it('finds the stale container a take without the occurrence key publishes', async () => {
    const result = await explore(scenario('edit', takeIgnoringOccurrence));

    expect(result.violation?.message).toBe(
      'container-1 made for "Golden hour" was published for "Golden hour, edited"',
    );
  });
});
