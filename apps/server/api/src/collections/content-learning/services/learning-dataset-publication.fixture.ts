import { AgentArtifactReferenceService } from '@api/agent-artifacts/agent-artifact-reference.service';
import { LearningAccountService } from '@api/collections/content-learning/services/learning-account.service';
import { LearningBaselineMaterializationService } from '@api/collections/content-learning/services/learning-baseline-materialization.service';
import { LearningCheckpointService } from '@api/collections/content-learning/services/learning-checkpoint.service';
import { LearningDependencyService } from '@api/collections/content-learning/services/learning-dependency.service';
import {
  LearningOperationService,
  learningHash,
} from '@api/collections/content-learning/services/learning-operation.service';
import { LearningPolicyService } from '@api/collections/content-learning/services/learning-policy.service';
import {
  learningPublicationDependencyRefsV1,
  resolveLearningPublicationSourceV1,
} from '@api/collections/content-learning/services/learning-publication-source.helper';
import { LearningScopeStateService } from '@api/collections/content-learning/services/learning-scope-state.service';
import { PostLifecycleService } from '@api/post-lifecycle/post-lifecycle.service';
import { PublishApprovalsService } from '@api/publish-approvals/publish-approvals.service';
import type { ServerLogger } from '@api/server.dependencies';
import type { PrismaService as ApiPrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  Platform,
  PostCategory,
  PostFormat,
  PostVisibility,
  TargetExecutionState,
} from '@genfeedai/contracts';
import type {
  LearningMetrics,
  LearningScope,
} from '@genfeedai/contracts/interfaces/analytics/content-learning.interface';
import {
  learningDescriptorTuple,
  learningRegisteredProfiles,
} from '@genfeedai/harness';
import type {
  ContentLearningBaseline,
  ContentLearningCheckpoint,
  PrismaClient,
} from '@genfeedai/prisma';
import type { LoggerService } from '@libs/logger/logger.service';
import type { PrismaService } from '@libs/prisma/prisma.service';
import { SchedulerPublishStateService } from '@workers/services/scheduler-publish-state.service';

const logger: ServerLogger = { error: () => {}, log: () => {}, warn: () => {} };
const publishedAt = new Date('2026-09-01T00:00:00.000Z');

export async function createLearningDatasetPublication(
  prisma: PrismaClient<'query'>,
  index: number,
) {
  const organizationId = `org-${(index % 10) % 2}`;
  const postId = `post-${index}`;
  await prisma.post.create({
    data: {
      id: postId,
      description: `Fixture publication ${index}`,
      userId: 'actor',
      organizationId,
      brandId: `brand-${(index % 10) % 2}`,
      credentialId: `credential-${index % 10}`,
      platform: Platform.TWITTER,
      category: PostCategory.TEXT,
      format: PostFormat.STANDARD,
      visibility: PostVisibility.PUBLIC,
      timezone: 'UTC',
      targetAttachments: [],
      targetSettings: {},
    },
  });
  const artifacts = new AgentArtifactReferenceService(prisma, logger);
  const approvals = new PublishApprovalsService(prisma, artifacts, logger);
  const approval = await approvals.createForCurrentPost({
    actorUserId: 'actor',
    mode: 'immediate',
    organizationId,
    postId,
  });
  await approvals.markQueued(approval.id, organizationId, 'actor');
  const claim = await approvals.claimForExecution({
    approvalId: approval.id,
    operationId: approval.operationId,
    organizationId,
    postId,
    versionPinId: approval.artifactVersionPinId,
  });
  if (claim.isAlreadyPublished || !claim.executionStartedAt)
    throw new Error(
      'Fixture publication did not acquire actual execution lease',
    );
  const lifecycle = new PostLifecycleService(prisma, logger);
  const scheduler = new SchedulerPublishStateService(
    prisma as unknown as PrismaService,
    logger as LoggerService,
    lifecycle,
  );
  const publishing = await scheduler.transitionPost(
    { id: postId, organizationId },
    { executionState: TargetExecutionState.PUBLISHING },
    'Isolated fixture transport started',
  );
  if (!publishing)
    throw new Error('Fixture failed actual publishing transition');
  const externalId = `fixture-external-${index}`;
  const completed = await scheduler.transitionPost(
    { id: postId, organizationId },
    {
      executionState: TargetExecutionState.PUBLISHED,
      visibility: PostVisibility.PUBLIC,
      externalId,
      publishedAt,
    },
    'Isolated fixture transport completed',
    undefined,
    {
      source: 'isolated-dataset-transport',
      result: {
        success: true,
        isProviderDraft: false,
        executionState: TargetExecutionState.PUBLISHED,
        platform: Platform.TWITTER,
        externalId,
      },
    },
  );
  if (!completed) throw new Error('Fixture failed actual published transition');
  await approvals.completeExecution({
    approvalId: approval.id,
    operationId: approval.operationId,
    organizationId,
    versionPinId: approval.artifactVersionPinId,
    executionStartedAt: claim.executionStartedAt,
    isSuccessful: true,
  });
  const source = await resolveLearningPublicationSourceV1(
    prisma,
    organizationId,
    postId,
  );
  if (!source)
    throw new Error(
      'Production publication did not produce canonical learning authority',
    );
  return { index, source, refs: learningPublicationDependencyRefsV1(source) };
}

export async function createLearningDatasetPublications(
  prisma: PrismaClient<'query'>,
  size: number,
) {
  const publications: Awaited<
    ReturnType<typeof createLearningDatasetPublication>
  >[] = [];
  for (let batch = 0; batch < size; batch += 1000) {
    const end = Math.min(size, batch + 1000);
    for (let start = batch; start < end; start += 4) {
      const group = await Promise.all(
        Array.from({ length: Math.min(4, end - start) }, (_, offset) =>
          createLearningDatasetPublication(prisma, start + offset),
        ),
      );
      publications.push(...group);
    }
  }
  return publications;
}

export async function createLearningDatasetPublicationEvidence(
  prisma: PrismaClient<'query'>,
  publications: Awaited<ReturnType<typeof createLearningDatasetPublications>>,
) {
  const servicePrisma = prisma as unknown as ApiPrismaService;
  const dependencies = new LearningDependencyService(servicePrisma);
  const scopes = new LearningScopeStateService(servicePrisma, dependencies);
  const accounts = new LearningAccountService(
    servicePrisma,
    new LearningOperationService(servicePrisma),
    dependencies,
    scopes,
    new LearningPolicyService(servicePrisma, dependencies, scopes),
  );
  const capture = new LearningCheckpointService(
    servicePrisma,
    accounts,
    dependencies,
  );
  const materializer = new LearningBaselineMaterializationService(
    servicePrisma,
    dependencies,
  );
  const registered = learningRegisteredProfiles(
    Platform.TWITTER,
    'text',
    'engagement',
  )[0];
  if (!registered)
    throw new Error(
      'Fixture requires actual registered Twitter engagement profile',
    );
  const descriptor = registered.descriptor;
  const metrics: LearningMetrics = {
    collection: { version: 1, outcome: 'observed', reasonCode: null },
    isPaid: false,
    isPinned: false,
    metrics: {},
  };
  for (const name of [
    descriptor.exposureSource,
    ...descriptor.metricWeights.map(([metric]) => metric),
  ])
    metrics.metrics[name] = {
      value: name === descriptor.exposureSource ? 1000 : 10,
      availability: 'observed',
      source: 'provider',
    };
  const checkpoints: ContentLearningCheckpoint[] = [];
  for (const publication of publications.slice(0, 200)) {
    const source = publication.source;
    const result = await capture.capture({
      publicationSource: source,
      organizationId: source.organizationId,
      postId: source.postId,
      credentialId: source.credentialId,
      format: 'text',
      objective: 'engagement',
      publishedAt,
      requestStartedAt: new Date('2026-09-03T00:00:00.000Z'),
      receivedAt: new Date('2026-09-03T00:01:00.000Z'),
      sourceAttemptId: `attempt-${publication.index}`,
      learningMetrics: metrics,
    });
    if (result?.validity !== 'valid')
      throw new Error('Actual production checkpoint capture failed');
    checkpoints.push(result);
  }
  const baselines: ContentLearningBaseline[] = [];
  for (let account = 0; account < 10; account++) {
    const source = publications[account].source;
    const scope: LearningScope = {
      organizationId: source.organizationId,
      brandId: source.brandId,
      credentialId: source.credentialId,
      platform: Platform.TWITTER,
      format: 'text',
      objective: 'engagement',
      rewardProfileId: learningHash(learningDescriptorTuple(descriptor)),
    };
    await scopes.ensure(servicePrisma, scope, descriptor, 0);
    const baseline = await materializer.materialize(
      scope,
      descriptor,
      new Date('2026-09-04T00:00:00.000Z'),
    );
    if (baseline?.count !== 20 || baseline.validity !== 'valid')
      throw new Error(
        'Actual materializer did not produce twenty-contributor baseline',
      );
    baselines.push(baseline);
  }
  return { checkpoints, baselines };
}

export async function withdrawLearningDatasetPublication(
  prisma: PrismaClient<'query'>,
  postId: string,
  organizationId: string,
) {
  const lifecycle = new PostLifecycleService(prisma, logger);
  const scheduler = new SchedulerPublishStateService(
    prisma as unknown as PrismaService,
    logger as LoggerService,
    lifecycle,
  );
  const applied = await scheduler.transitionPost(
    { id: postId, organizationId },
    {
      executionState: TargetExecutionState.PUBLISHED,
      visibility: PostVisibility.PRIVATE,
    },
    'Isolated fixture publication withdrawal',
  );
  if (!applied)
    throw new Error('Actual production publication withdrawal failed');
}
