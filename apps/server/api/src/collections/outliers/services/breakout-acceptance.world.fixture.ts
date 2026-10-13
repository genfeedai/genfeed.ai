import { randomUUID } from 'node:crypto';
import { AgentArtifactReferenceService } from '@api/agent-artifacts/agent-artifact-reference.service';
import type { WorkflowInitiatingActor } from '@api/authorization/brand-access/workflow-actor.util';
import {
  capturePostExposureObservation,
  loadPostExposurePublication,
} from '@api/collections/outliers/services/post-exposure-observation.util';
import { createPostIngredientLinks } from '@api/collections/posts/services/post-ingredient-links.util';
import { PostLifecycleService } from '@api/post-lifecycle/post-lifecycle.service';
import { PublishApprovalsService } from '@api/publish-approvals/publish-approvals.service';
import type { ServerLogger } from '@api/server.dependencies';
import { TwitterResponseMapper } from '@api/services/integrations/twitter/services/twitter-response.mapper';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import {
  Platform,
  PostCategory,
  PostFormat,
  PostVisibility,
  TargetExecutionState,
} from '@genfeedai/contracts';
import type {
  BreakoutExposureEvidence,
  BreakoutPublicationSourceV1,
} from '@genfeedai/contracts/interfaces';
import {
  IngredientCategory,
  IngredientStatus,
  PrismaClient,
} from '@genfeedai/prisma';
import type { LoggerService } from '@libs/logger/logger.service';
import { createMediaUrlExtension } from '@libs/prisma/media-url.extension';
import type { PrismaService as LibsPrismaService } from '@libs/prisma/prisma.service';
import { PrismaPg } from '@prisma/adapter-pg';
import { SchedulerPublishStateService } from '@workers/services/scheduler-publish-state.service';
import { Client } from 'pg';
import { beforeAll } from 'vitest';

/**
 * Real-PostgreSQL world for the connected #6526 acceptance suites. Everything here writes
 * through production code paths (publish approvals, the scheduler state machine, the exposure
 * capture utility); only provider and catalog edges are faked elsewhere. Every fixture gets
 * unique ids so suites can share the CI-provisioned, fully migrated database.
 */

export const silentLogger: ServerLogger = {
  error: () => {},
  log: () => {},
  warn: () => {},
};

/** A LoggerService double that records warnings, so suites can assert on swallowed failures. */
export function recordingLogger() {
  const warnings: Array<{ message: string; meta: unknown }> = [];
  const logger = {
    debug: () => {},
    error: () => {},
    log: () => {},
    warn: (message: string, meta?: unknown) => {
      warnings.push({ message, meta });
    },
  };
  return { logger: logger as unknown as LoggerService, warnings };
}

/** Narrows a looked-up fixture value; a missing one is a broken scenario, not a result. */
export function must<T>(value: T | null | undefined, what = 'value'): T {
  if (value === null || value === undefined)
    throw new Error(`Acceptance scenario expected ${what}`);
  return value;
}

export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

/** The source of impressions evidence the real X mapper emits for an organic post. */
export const X_ORGANIC_IMPRESSIONS_SOURCE =
  'twitter:post:organic_metrics.impression_count';

/** Breakout role keys the brand-access policy resolves. Shared rows, never deleted. */
const ROLE_KEYS = ['owner', 'admin', 'creator', 'user'] as const;

export function acceptanceDatabaseUrl(): string | undefined {
  const connectionString = process.env.BILLING_ACCOUNT_SCOPE_TEST_DATABASE_URL;
  if (!connectionString) return undefined;
  const url = new URL(connectionString);
  if (
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
    !/test/i.test(url.pathname)
  )
    throw new Error(
      'Breakout acceptance needs the disposable local migrated database',
    );
  return connectionString;
}

/** Session advisory lock key the acceptance files serialize on. */
const ACCEPTANCE_LOCK_KEY = 6_526_001;

export function openAcceptanceDatabase(connectionString: string): {
  close: () => Promise<void>;
  /** Raw client with the media URL result extension, as the production client has it. */
  db: PrismaClient<'query'>;
  prisma: PrismaService;
} {
  const base = new PrismaClient({
    adapter: new PrismaPg({ connectionString, max: 12 }),
  });
  const extended = base.$extends(
    createMediaUrlExtension({ cdnUrl: 'http://127.0.0.1' }),
  );
  // Project the canonical client ABI; every operation still uses the real extension.
  const db = new Proxy(base, {
    get(_target, property) {
      const value: unknown = Reflect.get(extended, property, extended);
      return typeof value === 'function' ? value.bind(extended) : value;
    },
  }) as unknown as PrismaClient<'query'>;
  // The acceptance files share one database and its global rows (roles, the learning fence,
  // hidden system workflows). Concurrent files race on them, so each file holds one session
  // advisory lock for its whole run and the files take turns.
  const lock = new Client({ connectionString });
  beforeAll(async () => {
    await lock.connect();
    await lock.query('SELECT pg_advisory_lock($1)', [ACCEPTANCE_LOCK_KEY]);
  }, 900_000);
  return {
    close: async () => {
      await base.$disconnect();
      await lock.end();
    },
    db,
    prisma: db as unknown as PrismaService,
  };
}

export type AcceptanceUser = {
  id: string;
  memberId: string;
  roleKey: string;
};

export type AcceptanceWorld = {
  billingAccountId: string;
  brandId: string;
  credentialId: string;
  externalHandle: string;
  organizationId: string;
  /** Org owner, assigned to the brand: the human whose session configures collection. */
  owner: AcceptanceUser;
  /** A creator assigned to the brand. */
  creator: AcceptanceUser;
  /** A creator with no brand assignment. */
  outsider: AcceptanceUser;
  strategyId: string;
  suffix: string;
};

export type WorldOptions = {
  /** Wallet balance in credits. */
  balance?: number;
  /** Strategy `config`, merged over the generous defaults. */
  config?: Record<string, unknown>;
  /** Strategy `policies`, merged over the generous defaults. */
  policies?: Record<string, unknown>;
  /** Strategy platforms; defaults to the X credential's platform. */
  platforms?: string[];
  /**
   * The organization's opt-ins (#6526). Production defaults both to off; the world turns them
   * on so a scenario exercises the feature, and a scenario that tests the opt-in turns one off.
   */
  isBreakoutResponsesEnabled?: boolean;
  isBreakoutAutoPublishEnabled?: boolean;
};

/** Actor shape the workflow admission persists for a signed-in session user. */
export function sessionActor(
  world: Pick<AcceptanceWorld, 'organizationId'>,
  user: Pick<AcceptanceUser, 'id'>,
): WorkflowInitiatingActor {
  return {
    isApiKey: false,
    organizationId: world.organizationId,
    scopes: [],
    userId: user.id,
  };
}

export async function seedAcceptanceWorld(
  db: PrismaClient<'query'>,
  options: WorldOptions = {},
): Promise<AcceptanceWorld> {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 16);
  for (const key of ROLE_KEYS)
    await db.role.upsert({
      create: { key, label: key },
      update: {},
      where: { key },
    });
  const roles = new Map(
    (await db.role.findMany({ where: { key: { in: [...ROLE_KEYS] } } })).map(
      (role) => [role.key, role.id],
    ),
  );
  const userIds = {
    creator: `bk-creator-${suffix}`,
    outsider: `bk-outsider-${suffix}`,
    owner: `bk-owner-${suffix}`,
  };
  for (const id of Object.values(userIds))
    await db.user.create({ data: { handle: id, id } });
  const billingAccountId = `bk-billing-${suffix}`;
  await db.billingAccount.create({ data: { id: billingAccountId } });
  const organizationId = `bk-org-${suffix}`;
  await db.organization.create({
    data: {
      billingAccountId,
      id: organizationId,
      label: organizationId,
      slug: organizationId,
      userId: userIds.owner,
    },
  });
  await db.organizationSetting.create({
    data: {
      isBreakoutAutoPublishEnabled:
        options.isBreakoutAutoPublishEnabled ?? true,
      isBreakoutResponsesEnabled: options.isBreakoutResponsesEnabled ?? true,
      organizationId,
    },
  });
  await db.creditBalance.create({
    data: {
      balance: options.balance ?? 1000,
      billingAccountId,
      heldAmount: 0,
      organizationId,
      version: 0,
    },
  });
  const brandId = `bk-brand-${suffix}`;
  await db.brand.create({
    data: {
      id: brandId,
      label: brandId,
      organizationId,
      slug: brandId,
      userId: userIds.owner,
    },
  });
  const otherBrandId = `bk-brand-b-${suffix}`;
  await db.brand.create({
    data: {
      id: otherBrandId,
      label: otherBrandId,
      organizationId,
      slug: otherBrandId,
      userId: userIds.owner,
    },
  });
  const member = async (
    id: string,
    roleKey: (typeof ROLE_KEYS)[number],
    assigned: string[],
  ): Promise<AcceptanceUser> => {
    const roleId = roles.get(roleKey);
    if (!roleId) throw new Error(`Missing role ${roleKey}`);
    const created = await db.member.create({
      data: {
        brands: { connect: assigned.map((assignedId) => ({ id: assignedId })) },
        currentBrandId: brandId,
        isActive: true,
        organizationId,
        roleId,
        roleKey: roleKey.toUpperCase(),
        userId: id,
      },
    });
    return { id, memberId: created.id, roleKey };
  };
  const owner = await member(userIds.owner, 'owner', [brandId]);
  const creator = await member(userIds.creator, 'creator', [brandId]);
  const outsider = await member(userIds.outsider, 'creator', [otherBrandId]);
  const credentialId = `bk-credential-${suffix}`;
  const externalHandle = `bk_${suffix}`;
  await db.credential.create({
    data: {
      brandId,
      connectedAt: new Date(),
      externalHandle,
      externalId: `x-account-${suffix}`,
      id: credentialId,
      isConnected: true,
      organizationId,
      platform: 'TWITTER',
      userId: userIds.owner,
    },
  });
  const strategyId = `bk-strategy-${suffix}`;
  await db.agentStrategy.create({
    data: {
      brandId,
      config: {
        creditsUsedThisWeek: 0,
        creditsUsedToday: 0,
        dailyCreditBudget: 1000,
        dailyCreditsUsed: 0,
        monthToDateCreditsUsed: 0,
        postsPerWeek: 10,
        publishingCeilingPerWeek: 20,
        readyDraftReserve: 0,
        timezone: 'UTC',
        weeklyCreditBudget: 5000,
        ...options.config,
      },
      id: strategyId,
      isActive: true,
      label: 'Breakout acceptance',
      organizationId,
      platforms: options.platforms ?? [Platform.TWITTER],
      policies: {
        budgetPolicy: {
          monthlyCreditBudget: 5000,
          perFormatCaps: [],
          perPlatformCaps: [],
        },
        publishPolicy: { minPostScore: 70 },
        ...options.policies,
      },
      userId: userIds.owner,
    },
  });
  return {
    billingAccountId,
    brandId,
    creator,
    credentialId,
    externalHandle,
    organizationId,
    outsider,
    owner,
    strategyId,
    suffix,
  };
}

/** A key the way an API-key session persists it: live row plus the actor that carries it. */
export async function seedApiKey(
  db: PrismaClient<'query'>,
  world: AcceptanceWorld,
  user: AcceptanceUser,
  scopes: string[],
): Promise<{ actor: WorkflowInitiatingActor; id: string }> {
  const id = `bk-key-${randomUUID().replaceAll('-', '').slice(0, 16)}`;
  await db.apiKey.create({
    data: {
      id,
      key: `${id}-secret`,
      label: id,
      organizationId: world.organizationId,
      scopes,
      userId: user.id,
    },
  });
  return {
    actor: {
      apiKeyId: id,
      isApiKey: true,
      organizationId: world.organizationId,
      scopes: [...scopes].sort(),
      userId: user.id,
    },
    id,
  };
}

export type SourceMediaFormat = 'image' | 'carousel' | 'video' | 'short';
const SOURCE_MEDIA: Record<
  SourceMediaFormat,
  { category: IngredientCategory; count: number; postCategory: PostCategory }
> = {
  carousel: {
    category: IngredientCategory.IMAGE,
    count: 3,
    postCategory: PostCategory.IMAGE,
  },
  image: {
    category: IngredientCategory.IMAGE,
    count: 1,
    postCategory: PostCategory.IMAGE,
  },
  short: {
    category: IngredientCategory.VIDEO,
    count: 1,
    postCategory: PostCategory.REEL,
  },
  video: {
    category: IngredientCategory.VIDEO,
    count: 1,
    postCategory: PostCategory.VIDEO,
  },
};

/** Stored, ready assets for a source post of a visual format. */
async function seedSourceMedia(
  db: PrismaClient<'query'>,
  world: AcceptanceWorld,
  format: SourceMediaFormat,
): Promise<string[]> {
  const { category, count } = SOURCE_MEDIA[format];
  const ids: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const created = await db.ingredient.create({
      data: {
        brandId: world.brandId,
        category,
        organizationId: world.organizationId,
        s3Key: `acceptance/source/${randomUUID()}`,
        status: IngredientStatus.GENERATED,
        userId: world.owner.id,
        version: 1,
      },
    });
    ids.push(created.id);
  }
  return ids;
}

export type PublishedPost = {
  externalId: string;
  postId: string;
  publishedAt: Date;
  text: string;
};

/**
 * Publishes an own X post through the real approval, claim, lifecycle and finalization path,
 * so the canonical publication binding (approval, version pin, finalization) is genuine.
 */
export async function publishOwnPost(
  db: PrismaClient<'query'>,
  world: AcceptanceWorld,
  input: {
    publishedAt: Date;
    text: string;
    externalId?: string;
    /** The visual format of the post; text when absent. */
    media?: SourceMediaFormat;
  },
): Promise<PublishedPost> {
  const postId = `bk-post-${randomUUID().replaceAll('-', '').slice(0, 20)}`;
  const externalId =
    input.externalId ?? `x-${randomUUID().replaceAll('-', '').slice(0, 18)}`;
  const mediaIds = input.media
    ? await seedSourceMedia(db, world, input.media)
    : [];
  await db.post.create({
    data: {
      brandId: world.brandId,
      category: input.media
        ? SOURCE_MEDIA[input.media].postCategory
        : PostCategory.TEXT,
      ...(mediaIds.length > 0
        ? {
            ingredientLinks: createPostIngredientLinks(
              world.organizationId,
              mediaIds,
            ),
          }
        : {}),
      credentialId: world.credentialId,
      description: input.text,
      format: PostFormat.STANDARD,
      id: postId,
      organizationId: world.organizationId,
      platform: Platform.TWITTER,
      targetAttachments: [],
      targetSettings: {},
      timezone: 'UTC',
      userId: world.owner.id,
      visibility: PostVisibility.PUBLIC,
    },
  });
  const artifacts = new AgentArtifactReferenceService(db, silentLogger);
  const approvals = new PublishApprovalsService(db, artifacts, silentLogger);
  const approval = await approvals.createForCurrentPost({
    actorUserId: world.owner.id,
    mode: 'immediate',
    organizationId: world.organizationId,
    postId,
  });
  await approvals.markQueued(approval.id, world.organizationId, world.owner.id);
  const claim = await approvals.claimForExecution({
    approvalId: approval.id,
    operationId: approval.operationId,
    organizationId: world.organizationId,
    postId,
    versionPinId: approval.artifactVersionPinId,
  });
  if (claim.isAlreadyPublished || !claim.executionStartedAt)
    throw new Error('Fixture publication did not acquire its execution lease');
  const lifecycle = new PostLifecycleService(db, silentLogger);
  const scheduler = new SchedulerPublishStateService(
    db as unknown as LibsPrismaService,
    silentLogger as unknown as LoggerService,
    lifecycle,
  );
  const ref = { id: postId, organizationId: world.organizationId };
  if (
    !(await scheduler.transitionPost(
      ref,
      { executionState: TargetExecutionState.PUBLISHING },
      'Acceptance fixture transport started',
    ))
  )
    throw new Error('Fixture could not enter PUBLISHING');
  if (
    !(await scheduler.transitionPost(
      ref,
      {
        executionState: TargetExecutionState.PUBLISHED,
        externalId,
        publishedAt: input.publishedAt,
        visibility: PostVisibility.PUBLIC,
      },
      'Acceptance fixture transport completed',
      undefined,
      {
        result: {
          executionState: TargetExecutionState.PUBLISHED,
          externalId,
          isProviderDraft: false,
          platform: Platform.TWITTER,
          success: true,
        },
        source: 'breakout-acceptance-transport',
      },
    ))
  )
    throw new Error('Fixture could not enter PUBLISHED');
  await approvals.completeExecution({
    approvalId: approval.id,
    executionStartedAt: claim.executionStartedAt,
    isSuccessful: true,
    operationId: approval.operationId,
    organizationId: world.organizationId,
    versionPinId: approval.artifactVersionPinId,
  });
  return {
    externalId,
    postId,
    publishedAt: input.publishedAt,
    text: input.text,
  };
}

/** The impressions evidence the real X mapper produces for an organic post metric. */
export function organicImpressions(
  impressions: number,
): BreakoutExposureEvidence {
  const analytics = new TwitterResponseMapper().mapAnalytics({
    data: [
      {
        organic_metrics: { impression_count: impressions },
        public_metrics: { impression_count: impressions + 5 },
      },
    ],
  });
  const evidence = analytics.breakoutExposures?.impressions;
  if (evidence?.availability !== 'observed')
    throw new Error('Real X mapper did not emit organic impressions');
  return evidence;
}

export function exposureSourceInput(
  world: AcceptanceWorld,
  post: Pick<PublishedPost, 'externalId' | 'postId'>,
) {
  return {
    brandId: world.brandId,
    credentialId: world.credentialId,
    externalId: post.externalId,
    organizationId: world.organizationId,
    platform: Platform.TWITTER,
    postId: post.postId,
  };
}

/** The canonical publication binding of an own post, as the collectors prepare it. */
export async function resolveExposureSource(
  db: PrismaClient<'query'>,
  world: AcceptanceWorld,
  post: Pick<PublishedPost, 'externalId' | 'postId'>,
): Promise<BreakoutPublicationSourceV1> {
  const source = await db.$transaction((tx) =>
    loadPostExposurePublication(tx, exposureSourceInput(world, post)),
  );
  if (!source) throw new Error('Publication did not resolve');
  return source;
}

/** Stores one prospective observation of `post` at the given age, via the production writer. */
export async function captureObservationAt(
  db: PrismaClient<'query'>,
  post: PublishedPost,
  source: BreakoutPublicationSourceV1,
  input: { ageMs: number; impressions: number; attempt?: string },
) {
  const receivedAt = new Date(post.publishedAt.getTime() + input.ageMs);
  const result = await db.$transaction((tx) =>
    capturePostExposureObservation(tx, {
      exposures: { impressions: organicImpressions(input.impressions) },
      isPinned: null,
      isPromoted: null,
      receivedAt,
      requestStartedAt: new Date(receivedAt.getTime() - 20_000),
      source,
      sourceAttemptId: input.attempt ?? `seed-${randomUUID()}`,
    }),
  );
  if (result.status !== 'captured')
    throw new Error(`Fixture observation was ${result.status}`);
  return result.observationId;
}

/**
 * Five distinct earlier own posts, each observed about an hour after publication: the
 * comparable-age baseline a roughly tenfold breakout is measured against.
 */
export async function seedComparableHistory(
  db: PrismaClient<'query'>,
  world: AcceptanceWorld,
  options: {
    /** The visual format the earlier posts share with the target; text when absent. */
    media?: SourceMediaFormat;
    /** Age of each earlier post when it was observed; the breakout is compared at this age. */
    observedAtAgeMs?: number;
    values?: number[];
    nowMs?: number;
  } = {},
): Promise<PublishedPost[]> {
  const values = options.values ?? [100, 110, 120, 90, 105];
  const nowMs = options.nowMs ?? Date.now();
  const observedAtAgeMs = options.observedAtAgeMs ?? 60 * MINUTE_MS;
  // Earlier posts are always old enough to have been observed at that age.
  const daysBack = Math.ceil(observedAtAgeMs / DAY_MS) + 1;
  const posts: PublishedPost[] = [];
  for (const [index, impressions] of values.entries()) {
    const post = await publishOwnPost(db, world, {
      publishedAt: new Date(nowMs - (index + daysBack) * DAY_MS),
      text: `History post ${index + 1} for the acceptance baseline`,
      ...(options.media ? { media: options.media } : {}),
    });
    const source = await resolveExposureSource(db, world, post);
    if (!source) throw new Error('History publication did not resolve');
    await captureObservationAt(db, post, source, {
      ageMs: observedAtAgeMs,
      impressions,
    });
    posts.push(post);
  }
  return posts;
}

/** The member's session ends (left the organization or was deactivated). */
export async function revokeMembership(
  db: PrismaClient<'query'>,
  world: AcceptanceWorld,
  user: AcceptanceUser,
): Promise<void> {
  await db.member.update({
    data: { isActive: false },
    where: scopedWhere(world.organizationId, { id: user.memberId }),
  });
}

export async function restoreMembership(
  db: PrismaClient<'query'>,
  world: AcceptanceWorld,
  user: AcceptanceUser,
): Promise<void> {
  await db.member.update({
    data: { isActive: true },
    where: scopedWhere(world.organizationId, { id: user.memberId }),
  });
}

/** The member keeps the organization but loses assignment to the brand. */
export async function removeBrandAccess(
  db: PrismaClient<'query'>,
  world: AcceptanceWorld,
  user: AcceptanceUser,
): Promise<void> {
  await db.member.update({
    data: { brands: { disconnect: [{ id: world.brandId }] } },
    where: scopedWhere(world.organizationId, { id: user.memberId }),
  });
}

export async function grantBrandAccess(
  db: PrismaClient<'query'>,
  world: AcceptanceWorld,
  user: AcceptanceUser,
): Promise<void> {
  await db.member.update({
    data: { brands: { connect: [{ id: world.brandId }] } },
    where: scopedWhere(world.organizationId, { id: user.memberId }),
  });
}

export async function revokeApiKey(
  db: PrismaClient<'query'>,
  keyId: string,
): Promise<void> {
  await db.apiKey.update({
    data: { isRevoked: true, revokedAt: new Date() },
    where: { id: keyId },
  });
}
