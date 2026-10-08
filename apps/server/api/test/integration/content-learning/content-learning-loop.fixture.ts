import 'reflect-metadata';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { AgentArtifactReferenceService } from '@api/agent-artifacts/agent-artifact-reference.service';
import { LearningAccountService } from '@api/collections/content-learning/services/learning-account.service';
import { LearningBaselineMaterializationService } from '@api/collections/content-learning/services/learning-baseline-materialization.service';
import { LearningCheckpointService } from '@api/collections/content-learning/services/learning-checkpoint.service';
import { LearningDecisionService } from '@api/collections/content-learning/services/learning-decision.service';
import { LearningDependencyService } from '@api/collections/content-learning/services/learning-dependency.service';
import {
  LearningOperationService,
  learningHash,
} from '@api/collections/content-learning/services/learning-operation.service';
import { LearningPolicyService } from '@api/collections/content-learning/services/learning-policy.service';
import { resolveLearningPublicationSourceV1 } from '@api/collections/content-learning/services/learning-publication-source.helper';
import { LearningRewardService } from '@api/collections/content-learning/services/learning-reward.service';
import { LearningScopeStateService } from '@api/collections/content-learning/services/learning-scope-state.service';
import { PostLifecycleService } from '@api/post-lifecycle/post-lifecycle.service';
import { PublishApprovalsService } from '@api/publish-approvals/publish-approvals.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  Platform,
  PostCategory,
  PostFormat,
  PostVisibility,
  TargetExecutionState,
} from '@genfeedai/contracts';
import {
  captureLearningMetrics,
  type LearningScope,
} from '@genfeedai/contracts/interfaces/analytics/content-learning.interface';
import {
  learningDescriptorTuple,
  learningRegisteredProfiles,
} from '@genfeedai/harness';
import { CredentialPlatform, PrismaClient } from '@genfeedai/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { SchedulerPublishStateService } from '@workers/services/scheduler-publish-state.service';
import { Client } from 'pg';
import { assertIsolatedDatabaseUrl } from '../../../scripts/assert-isolated-db-url';

/**
 * Owned-schema real-Postgres fixture for the learning generation loop (#5788).
 * It is deliberately unpinned: it never imports the frozen runtime fixture and
 * builds the production services with `new` on a client scoped to a unique
 * schema that is dropped on close.
 */
const OBJECTIVE = 'awareness' as const;
const OBSERVATION_AGE_MS = (48 * 60 + 10) * 60000;

export interface LearningLoopTarget {
  actorId: string;
  organizationId: string;
  brandId: string;
  credentialId: string;
}
export type LearningLoopDatabase = Awaited<
  ReturnType<typeof openLearningLoopDatabase>
>;
export type LearningLoopPublication = Awaited<
  ReturnType<typeof publishLearningLoopPost>
>;

function ensure(value: unknown, code: string): asserts value {
  if (!value) throw new Error(`Learning loop fixture: ${code}`);
}

export async function openLearningLoopDatabase() {
  const previousKey = process.env.TOKEN_ENCRYPTION_KEY;
  process.env.TOKEN_ENCRYPTION_KEY =
    'learning-loop-isolated-integration-test-only';
  const connectionString = assertIsolatedDatabaseUrl();
  const schema = `learning_loop_${randomUUID().replaceAll('-', '')}`;
  const sql = new Client({ connectionString });
  await sql.connect();
  await sql.query(`CREATE SCHEMA "${schema}"`);
  await sql.query(`SET search_path TO "${schema}", public`);
  const ddl = execFileSync(
    'bunx',
    [
      'prisma',
      'migrate',
      'diff',
      '--from-empty',
      '--to-schema',
      resolve('../../../packages/prisma/prisma/schema.prisma'),
      '--script',
    ],
    {
      cwd: resolve('../../../packages/prisma'),
      encoding: 'utf8',
      timeout: 60000,
    },
  );
  await sql.query(
    ddl
      .replaceAll('"public".', '')
      .replace(/CREATE SCHEMA IF NOT EXISTS "public";/g, ''),
  );
  const scoped = new URL(connectionString);
  scoped.searchParams.set('options', `-c search_path=${schema},public`);
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: scoped.toString() }, { schema }),
  });
  const db = prisma as unknown as PrismaService;
  const logger = {
    debug: () => undefined,
    error: () => undefined,
    log: () => undefined,
    warn: () => undefined,
  };
  const dependencies = new LearningDependencyService();
  const operations = new LearningOperationService(db);
  const scopes = new LearningScopeStateService(db, dependencies);
  const policies = new LearningPolicyService(db, dependencies, scopes);
  const accounts = new LearningAccountService(
    db,
    operations,
    dependencies,
    scopes,
    policies,
  );
  const checkpoints = new LearningCheckpointService(db, accounts, dependencies);
  const lifecycle = new PostLifecycleService(prisma as never, logger as never);
  const services = {
    dependencies,
    operations,
    scopes,
    policies,
    accounts,
    checkpoints,
    decisions: new LearningDecisionService(
      db,
      accounts,
      checkpoints,
      policies,
      scopes,
      dependencies,
    ),
    rewards: new LearningRewardService(db, dependencies),
    materializer: new LearningBaselineMaterializationService(db, dependencies),
    scheduler: new SchedulerPublishStateService(db, logger as never, lifecycle),
    approvals: new PublishApprovalsService(
      prisma as never,
      new AgentArtifactReferenceService(prisma as never),
    ),
  };
  return {
    schema,
    sql,
    prisma,
    services,
    restoreKey: () => {
      if (previousKey === undefined) delete process.env.TOKEN_ENCRYPTION_KEY;
      else process.env.TOKEN_ENCRYPTION_KEY = previousKey;
    },
  };
}

export async function closeLearningLoopDatabase(
  database: LearningLoopDatabase | undefined,
) {
  if (!database) return;
  await database.prisma.$disconnect();
  await database.sql.query(
    `DROP SCHEMA IF EXISTS "${database.schema}" CASCADE`,
  );
  await database.sql.end();
  database.restoreKey();
}

/** One owner, one organization with a connected X account and brand. */
export async function seedLearningLoopTenant(
  database: LearningLoopDatabase,
): Promise<LearningLoopTarget> {
  const { prisma, services } = database;
  const actorId = randomUUID();
  const organizationId = randomUUID();
  const brandId = randomUUID();
  const credentialId = randomUUID();
  const role = await prisma.role.upsert({
    where: { key: 'owner' },
    create: { key: 'owner', label: 'Owner' },
    update: {},
  });
  await prisma.user.create({
    data: { id: actorId, handle: `loop-${actorId}` },
  });
  await prisma.organization.create({
    data: {
      id: organizationId,
      userId: actorId,
      label: 'Learning loop organization',
      slug: `loop-${organizationId}`,
    },
  });
  await prisma.brand.create({
    data: {
      id: brandId,
      organizationId,
      userId: actorId,
      label: 'Learning loop brand',
      slug: `loop-${brandId}`,
      isActive: true,
    },
  });
  await prisma.member.create({
    data: {
      organizationId,
      userId: actorId,
      roleId: role.id,
      roleKey: 'owner',
      currentBrandId: brandId,
      brands: { connect: [{ id: brandId }] },
      isActive: true,
    },
  });
  await prisma.credential.create({
    data: {
      id: credentialId,
      organizationId,
      brandId,
      userId: actorId,
      platform: CredentialPlatform.TWITTER,
      externalId: `loop-account-${credentialId}`,
      isConnected: true,
      accessToken: 'loop-fixture-token',
      accessTokenSecret: 'loop-fixture-secret',
    },
  });
  await services.accounts.ensure(organizationId, credentialId);
  return { actorId, organizationId, brandId, credentialId };
}

/** The registered cell the account producer resolves for X text awareness. */
export async function ensureLearningLoopScope(
  database: LearningLoopDatabase,
  target: LearningLoopTarget,
) {
  const descriptor = learningRegisteredProfiles(
    'twitter',
    'text',
    OBJECTIVE,
  ).find((profile) => profile.capability.mask === 'LCS')?.descriptor;
  ensure(descriptor, 'REGISTERED_PROFILE');
  const scope: LearningScope = {
    organizationId: target.organizationId,
    brandId: target.brandId,
    credentialId: target.credentialId,
    platform: 'twitter',
    format: 'text',
    objective: OBJECTIVE,
    rewardProfileId: learningHash(learningDescriptorTuple(descriptor)),
  };
  const account = await database.services.accounts.ensure(
    target.organizationId,
    target.credentialId,
  );
  await database.services.scopes.ensure(
    database.prisma as unknown as PrismaService,
    scope,
    descriptor,
    account.epoch,
  );
  return { scope, descriptor };
}

/**
 * Publishes one post through the real approval and scheduler transitions,
 * 48h10m in the past so the observation window has closed.
 */
export async function publishLearningLoopPost(
  database: LearningLoopDatabase,
  target: LearningLoopTarget,
  options: { postId?: string; description?: string } = {},
) {
  const { prisma, services } = database;
  const id = options.postId ?? randomUUID();
  const externalId = `loop-publication-${id}`;
  const publishedAt = new Date(Date.now() - OBSERVATION_AGE_MS);
  await prisma.post.upsert({
    where: { id },
    create: {
      id,
      description: options.description ?? `Loop canonical text ${id}`,
      userId: target.actorId,
      organizationId: target.organizationId,
      brandId: target.brandId,
      credentialId: target.credentialId,
      platform: Platform.TWITTER,
      category: PostCategory.TEXT,
      format: PostFormat.STANDARD,
      timezone: 'UTC',
      targetAttachments: [],
      targetSettings: {},
      visibility: PostVisibility.PUBLIC,
    },
    update: {},
  });
  const approval = await services.approvals.createForCurrentPost({
    actorUserId: target.actorId,
    organizationId: target.organizationId,
    postId: id,
    mode: 'immediate',
  });
  await services.approvals.markQueued(
    approval.id,
    target.organizationId,
    target.actorId,
  );
  const claim = await services.approvals.claimForExecution({
    approvalId: approval.id,
    operationId: approval.operationId,
    organizationId: target.organizationId,
    postId: id,
    versionPinId: approval.artifactVersionPinId,
  });
  ensure(
    !claim.isAlreadyPublished && claim.executionStartedAt,
    'APPROVAL_LEASE',
  );
  ensure(
    await services.scheduler.transitionPost(
      { id, organizationId: target.organizationId },
      { executionState: TargetExecutionState.PUBLISHING },
      'Loop transport started',
    ),
    'PUBLISHING_TRANSITION',
  );
  ensure(
    await services.scheduler.transitionPost(
      { id, organizationId: target.organizationId },
      {
        executionState: TargetExecutionState.PUBLISHED,
        visibility: PostVisibility.PUBLIC,
        externalId,
        publishedAt,
      },
      'Loop transport completed',
      undefined,
      {
        source: 'learning-loop-owned-transport',
        result: {
          success: true,
          isProviderDraft: false,
          executionState: TargetExecutionState.PUBLISHED,
          platform: Platform.TWITTER,
          externalId,
        },
      },
    ),
    'PUBLICATION_TRANSITION',
  );
  await services.approvals.completeExecution({
    approvalId: approval.id,
    operationId: approval.operationId,
    organizationId: target.organizationId,
    versionPinId: approval.artifactVersionPinId,
    executionStartedAt: claim.executionStartedAt,
    isSuccessful: true,
  });
  const source = await resolveLearningPublicationSourceV1(
    prisma as never,
    target.organizationId,
    id,
  );
  ensure(source, 'PUBLICATION_SOURCE');
  return { id, externalId, publishedAt, target, source };
}

function loopMetrics() {
  const metrics = captureLearningMetrics(
    {
      views: 1000,
      impressions: 1000,
      reach: 1000,
      likes: 10,
      comments: 2,
      shares: 3,
      clicks: 0,
      isPaid: false,
      isPinned: false,
    },
    {
      views: 'views',
      impressions: 'impressions',
      reach: 'reach',
      likes: 'likes',
      comments: 'comments',
      shares: 'shares',
      clicks: 'clicks',
      saves: 'saves',
    },
  );
  for (const metric of Object.values(metrics.metrics))
    metric.source = 'provider';
  return metrics;
}

export function captureLearningLoopPublication(
  database: LearningLoopDatabase,
  publication: LearningLoopPublication,
) {
  return database.services.checkpoints.capture({
    publicationSource: publication.source,
    organizationId: publication.target.organizationId,
    credentialId: publication.target.credentialId,
    postId: publication.id,
    publishedAt: publication.publishedAt,
    requestStartedAt: new Date(),
    receivedAt: new Date(),
    sourceAttemptId: randomUUID(),
    format: 'text',
    objective: OBJECTIVE,
    learningMetrics: loopMetrics(),
  });
}
