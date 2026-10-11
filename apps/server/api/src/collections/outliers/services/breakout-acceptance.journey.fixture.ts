import type { AnalyticsCollectionAuthorization } from '@api/analytics/analytics-collection-action.types';
import type { BrandAccessActor } from '@api/authorization/brand-access/brand-access.service';
import { runWithRequestPrincipal } from '@api/authorization/brand-access/request-principal.context';
import type { WorkflowInitiatingActor } from '@api/authorization/brand-access/workflow-actor.util';
import {
  type BreakoutCandidate,
  type CandidateOptions,
  collectPost,
  resolveCollectionAuthorization,
  seedBreakoutCandidate,
  seedScheduledCollectionChain,
} from '@api/collections/outliers/services/breakout-acceptance.collection.fixture';
import {
  buildExecutionHarness,
  type ExecutionHarness,
  type ExecutionHarnessOptions,
  seedApprovedBrandIdentity,
} from '@api/collections/outliers/services/breakout-acceptance.execution.fixture';
import {
  type AcceptanceWorld,
  must,
  seedAcceptanceWorld,
  sessionActor,
  type WorldOptions,
} from '@api/collections/outliers/services/breakout-acceptance.world.fixture';
import { resolveTurboRunItems } from '@api/services/turbo-run/turbo-run.types';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import {
  Platform,
  PostCategory,
  PostFormat,
  TargetExecutionState,
} from '@genfeedai/contracts';
import type { BreakoutResponse, PrismaClient } from '@genfeedai/prisma';
import type { LoggerService } from '@libs/logger/logger.service';

export type DetectedBreakout = {
  authorization: AnalyticsCollectionAuthorization | undefined;
  candidate: BreakoutCandidate;
  harness: ExecutionHarness;
  jobId: string;
  response: BreakoutResponse;
  world: AcceptanceWorld;
};

export type DetectOptions = {
  /** The persisted schedule binding collection (and then execution) acts as. */
  actor?: (
    world: AcceptanceWorld,
    db: PrismaClient<'query'>,
  ) => WorkflowInitiatingActor | Promise<WorkflowInitiatingActor>;
  candidate?: CandidateOptions;
  harness?: ExecutionHarnessOptions;
  /** The latest, breakout measurement (default tenfold-plus). */
  impressions?: number;
  world?: WorldOptions;
};

export type AcceptanceEnv = {
  db: PrismaClient<'query'>;
  logger: LoggerService;
  prisma: PrismaService;
};

/**
 * Stage 1 as one call: a world, comparable history, a target and one authorized collection
 * of it. Returns the detected response and the job the producer queued for it.
 */
export async function detectBreakout(
  env: AcceptanceEnv,
  options: DetectOptions = {},
): Promise<DetectedBreakout> {
  const { db, logger, prisma } = env;
  const world = await seedAcceptanceWorld(db, options.world);
  await seedApprovedBrandIdentity(db, world);
  const candidate = await seedBreakoutCandidate(db, world, options.candidate);
  const harness = buildExecutionHarness(
    db,
    prisma,
    logger,
    world,
    options.harness,
  );
  harness.tweets.set(candidate.target.externalId, {
    impressions: options.impressions ?? 1500,
  });
  const actor = options.actor
    ? await options.actor(world, db)
    : sessionActor(world, world.owner);
  const chain = await seedScheduledCollectionChain(db, prisma, world, {
    actor,
  });
  const authorization = await resolveCollectionAuthorization(prisma, chain);
  await collectPost(harness, world, candidate.target, authorization);
  const response = must(
    await db.breakoutResponse.findFirst({
      where: scopedWhere(world.organizationId, {
        externalId: candidate.target.externalId,
      }),
    }),
    'the detected response',
  );
  const [jobId] = [...harness.interactive.jobs.keys()];
  return {
    authorization,
    candidate,
    harness,
    jobId: must(jobId, 'the queued job'),
    response,
    world,
  };
}

/**
 * A member approves the queued draft in the publishing inbox: the production review service
 * records the exact-version approval and schedules the post, under the member's request
 * principal, so the #6690/#6705 gate admits it as that member.
 */
export async function approveInReviewQueue(
  harness: ExecutionHarness,
  db: PrismaClient<'query'>,
  world: AcceptanceWorld,
  postId: string,
  approver: BrandAccessActor,
): Promise<void> {
  const post = must(
    await db.post.findFirst({
      where: scopedWhere(world.organizationId, { id: postId }),
    }),
    'the draft',
  );
  const turboRunId = must(
    post.reviewTurboRunId,
    'the review run it was queued in',
  );
  const run = must(
    await db.turboRun.findFirst({
      where: scopedWhere(world.organizationId, { id: turboRunId }),
    }),
    'the review run',
  );
  const itemIds = resolveTurboRunItems(run).map((item) => item.id);
  await runWithRequestPrincipal(approver, () =>
    harness.turboReview.approveItems(
      turboRunId,
      itemIds,
      world.organizationId,
      approver.userId,
    ),
  );
}

/**
 * Operator reconciliation of an attempt the provider answered but the caller never recorded:
 * the same receipt, draft and binding steps the generation service performs after provider
 * acceptance, driven through the real receipt, post and validation services. There is no
 * production reconciler for this state yet, so the sequence lives here.
 */
export async function reconcileAcceptedAttempt(
  harness: ExecutionHarness,
  db: PrismaClient<'query'>,
  world: AcceptanceWorld,
  input: {
    executionId: string;
    issued: { id: string; model: string; text: string };
    outputId: string;
  },
): Promise<{ postId: string }> {
  const output = must(
    await db.breakoutResponseOutput.findFirst({
      where: scopedWhere(world.organizationId, { id: input.outputId }),
    }),
    'the output',
  );
  const row = must(
    await db.brandedGenerationReceipt.findFirst({
      where: scopedWhere(world.organizationId, {
        brandId: world.brandId,
        candidateIndex: 0,
        requestKey: output.generationKey,
      }),
    }),
    'the retained receipt',
  );
  const actor = {
    actorId: world.owner.id,
    brandId: world.brandId,
    organizationId: world.organizationId,
  };
  const receipt = await harness.receipts.get(actor, row.id);
  const step = (current: { id: string; revision: number }, name: string) => ({
    expectedRevision: current.revision,
    operationKey: `${current.id}:${name}`,
  });
  const now = new Date().toISOString();
  const dispatched = await harness.receipts.recordDispatch(
    actor,
    receipt.id,
    step(receipt, 'reconcile-dispatch'),
    {
      dispatchClaimedAt: now,
      model: input.issued.model,
      provider: 'openrouter',
      providerAcceptedAt: now,
      providerAttemptRef: `openrouter:${input.issued.id}`,
    },
  );
  const post = await harness.posts.create(
    {
      agentStrategyId: world.strategyId,
      brandId: world.brandId,
      category: PostCategory.TEXT,
      credentialId: world.credentialId,
      description: input.issued.text,
      format: PostFormat.STANDARD,
      ingredients: [],
      label: 'Breakout follow-up',
      order: 0,
      organizationId: world.organizationId,
      platform: Platform.TWITTER,
      sourceActionId: `${output.generationKey}:post:0`,
      targetExecutionState: TargetExecutionState.DRAFT,
      userId: world.owner.id,
      workflowExecutionId: input.executionId,
    },
    [],
  );
  const binding = await harness.material.describePostArtifact(actor, post.id);
  const bound = await harness.receipts.bindArtifact(
    actor,
    dispatched.receipt.id,
    step(dispatched.receipt, 'reconcile-bind'),
    { ...binding, completedAt: new Date().toISOString() },
  );
  await harness.validation.validateReceipt(actor, bound.receipt.id);
  return { postId: post.id };
}
