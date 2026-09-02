import {
  type ChannelTargetValidationResult,
  validateChannelTargetSettings,
} from '@api-types/contracts/channel-capabilities.contract';
import type {
  ChannelTargetInput,
  UpdateChannelTargetInput,
} from '@api-types/contracts/scheduler.contract';
import {
  CredentialPlatform,
  PostCategory,
  PublishApprovalStatus,
  TargetExecutionState,
} from '@genfeedai/enums';
import type {
  IPublishingProviderReadiness,
  IReleaseGroup,
  PostGroupCreateProvenance,
} from '@genfeedai/interfaces';
import { Prisma } from '@genfeedai/prisma';
import {
  type PostLifecycleMutation,
  type PostLifecycleService,
  scopedWhere,
} from '@genfeedai/server';
import { BadRequestException, ConflictException } from '@nestjs/common';
import type {
  ManualRetryResolution,
  ResolveManualRetryParams,
  SchedulerTx,
} from '@server/collections/post-groups/services/post-group.types';
import type { PostGroupContractService } from '@server/collections/post-groups/services/post-group-contract.service';
import type { PostGroupPersistenceService } from '@server/collections/post-groups/services/post-group-persistence.service';
import type { PostGroupReadinessService } from '@server/collections/post-groups/services/post-group-readiness.service';
import type { ScheduledPostWorkflowSource } from '@server/collections/posts/services/scheduled-post-workflow-definition';
import type { ScheduledPostWorkflowQueueService } from '@server/collections/posts/services/scheduled-post-workflow-queue.service';
import type { PublishApprovalsService } from '@server/collections/publish-approvals/services/publish-approvals.service';
import {
  type ApiKeyPublishingContext,
  assertApiKeyPublishingScope,
} from '@server/helpers/utils/auth/api-key-publishing-scope.util';
import type { PrismaService } from '@server/shared/modules/prisma/prisma.service';

export type PostGroupTargetOperationDependencies = {
  contractService: PostGroupContractService;
  enqueueReleaseTargets: (
    release: IReleaseGroup,
    userId: string,
    targetIds?: string[],
    source?: ScheduledPostWorkflowSource,
  ) => Promise<void>;
  persistenceService: PostGroupPersistenceService;
  postLifecycleService: PostLifecycleService;
  prisma: PrismaService;
  publishApprovalsService: PublishApprovalsService;
  readinessService: PostGroupReadinessService;
  scheduledPostWorkflowQueue: ScheduledPostWorkflowQueueService;
};

type SchedulePostGroupTargetParams = {
  groupId: string;
  organizationId: string;
  provenance?: PostGroupCreateProvenance;
  scheduledDate: Date;
  targetId: string;
  userId: string;
  workflowSource: ScheduledPostWorkflowSource;
};

type UpdatePostGroupTargetParams = {
  apiKeyContext?: ApiKeyPublishingContext;
  body: unknown;
  groupId: string;
  organizationId: string;
  targetId: string;
  userId: string;
};

type ScheduledTargetResult = {
  isDueNow: boolean;
  release: IReleaseGroup;
};

function changesPublishedTargetState(input: UpdateChannelTargetInput): boolean {
  return (
    input.executionState === TargetExecutionState.PUBLISHED ||
    input.executionState === TargetExecutionState.PUBLISHING ||
    input.externalProviderId !== undefined ||
    input.externalShortcode !== undefined ||
    input.publishedAt !== undefined ||
    input.url !== undefined
  );
}

function assertWorkflowSourceTarget(
  workflowSource: ScheduledPostWorkflowSource,
  platform: CredentialPlatform,
  category: PostCategory | undefined,
): void {
  if (
    workflowSource === 'tiktok_app' &&
    (platform !== CredentialPlatform.TIKTOK ||
      (category !== PostCategory.VIDEO && category !== PostCategory.REEL))
  ) {
    throw new BadRequestException(
      'Publish via TikTok App is only available for TikTok videos.',
    );
  }
}

export async function schedulePostGroupTarget(
  params: SchedulePostGroupTargetParams,
  dependencies: PostGroupTargetOperationDependencies,
): Promise<IReleaseGroup> {
  const isDueNow = params.scheduledDate.getTime() <= Date.now() + 5000;
  const scheduled = await dependencies.prisma.$transaction((tx) =>
    scheduleTargetInTransaction(tx, params, dependencies, isDueNow),
  );

  if (scheduled.isDueNow) {
    await dependencies.enqueueReleaseTargets(
      scheduled.release,
      params.userId,
      [params.targetId],
      params.workflowSource,
    );
  }
  return scheduled.release;
}

async function scheduleTargetInTransaction(
  tx: SchedulerTx,
  params: SchedulePostGroupTargetParams,
  dependencies: PostGroupTargetOperationDependencies,
  isDueNow: boolean,
): Promise<ScheduledTargetResult> {
  const group = await dependencies.persistenceService.getGroupOrThrow(
    tx,
    params.organizationId,
    params.groupId,
  );
  const target = await dependencies.persistenceService.getTargetOrThrow(
    tx,
    params.organizationId,
    group.id,
    params.targetId,
  );

  dependencies.contractService.assertSchedulableTarget(group, target);
  const platform = dependencies.contractService.parseCredentialPlatform(
    target.platform,
  );
  assertWorkflowSourceTarget(params.workflowSource, platform, target.category);

  const targetInput: ChannelTargetInput = {
    credentialId: target.credentialId,
    platform,
    scheduledDate: params.scheduledDate.toISOString(),
    settings: dependencies.contractService.asRecord(target.targetSettings),
    timezone: target.timezone,
    visibility: dependencies.contractService.toPostVisibility(
      target.visibility,
    ),
  };
  const credentials = await dependencies.persistenceService.resolveCredentials(
    tx,
    params.organizationId,
    [targetInput],
  );
  await dependencies.persistenceService.resolveBrandId(
    tx,
    params.organizationId,
    group.brandId,
    credentials,
  );

  const validation = validateChannelTargetSettings({
    caption: group.baseContent,
    credentialId: targetInput.credentialId,
    media: dependencies.contractService.toValidationMedia(
      dependencies.contractService.asMedia(group.media),
    ),
    platform: targetInput.platform,
    publishMode: isDueNow ? 'publish_now' : 'scheduled',
    settings: targetInput.settings ?? {},
    visibility: targetInput.visibility,
  });
  if (!validation.valid) {
    throw dependencies.contractService.invalidTargetException(
      targetInput,
      validation,
    );
  }

  const readinessByCredential =
    await dependencies.readinessService.resolveForCredentials(
      tx,
      params.organizationId,
      [targetInput.credentialId],
    );
  const readiness = readinessByCredential.get(targetInput.credentialId);
  dependencies.readinessService.assertSchedulable(targetInput, readiness);

  const isExactReplay =
    target.targetExecutionState === TargetExecutionState.SCHEDULED &&
    target.scheduledDate?.getTime() === params.scheduledDate.getTime() &&
    dependencies.contractService.matchesScheduleProvenance(
      target,
      params.provenance,
    );
  if (!isExactReplay) {
    const transition = await dependencies.postLifecycleService.transition(
      {
        actorId: params.userId,
        groupId: group.id,
        guard: {
          expectedUpdatedAt: target.updatedAt,
          priorExecutionStates: [
            target.targetExecutionState as TargetExecutionState,
          ],
        },
        mutation: buildScheduleMutation(
          params,
          readiness ?? validation.readiness,
          validation,
          dependencies.contractService,
        ),
        nextState: TargetExecutionState.SCHEDULED,
        organizationId: params.organizationId,
        postId: target.id,
        reason: 'Channel target scheduled',
      },
      tx,
    );
    if (transition.kind === 'stale') {
      throw new ConflictException(
        'Channel target changed while scheduling. Refresh and retry.',
      );
    }
  }

  await dependencies.publishApprovalsService.createForCurrentPost({
    actorUserId: params.userId,
    ...(params.provenance?.agentContextVersion !== undefined && {
      contextVersion: params.provenance.agentContextVersion,
    }),
    mode: isDueNow ? 'immediate' : 'scheduled',
    organizationId: params.organizationId,
    postId: target.id,
    provenance: {
      releaseId: group.id,
      surface:
        params.provenance?.source === 'post-desk'
          ? 'post-desk-schedule'
          : 'agent-schedule-post',
    },
    transaction: tx,
  });

  const release =
    await dependencies.persistenceService.hydrateWithDerivedStatus(
      tx,
      params.organizationId,
      group.id,
    );
  return { isDueNow, release };
}

function buildScheduleMutation(
  params: SchedulePostGroupTargetParams,
  readiness: IPublishingProviderReadiness | null | undefined,
  validation: ChannelTargetValidationResult,
  contractService: PostGroupContractService,
): PostLifecycleMutation {
  return {
    ...(params.provenance?.agentContextSource && {
      agentContextSource: params.provenance.agentContextSource,
    }),
    ...(params.provenance?.agentContextVersion !== undefined && {
      agentContextVersion: params.provenance.agentContextVersion,
    }),
    ...(params.provenance?.workflowExecutionId && {
      workflowExecutionId: params.provenance.workflowExecutionId,
    }),
    ...(params.provenance?.agentStrategyId && {
      agentStrategyId: params.provenance.agentStrategyId,
    }),
    ...(params.provenance?.agentThreadId && {
      agentThreadId: params.provenance.agentThreadId,
    }),
    scheduledDate: params.scheduledDate,
    targetReadiness: contractService.toReadinessJson(readiness),
    targetValidationIssues: contractService.validationIssues(validation),
    targetValidationState: validation.validationState,
  };
}

export async function updatePostGroupTarget(
  params: UpdatePostGroupTargetParams,
  dependencies: PostGroupTargetOperationDependencies,
): Promise<IReleaseGroup> {
  const input = dependencies.contractService.parseTargetInput(params.body);
  assertApiKeyPublishingScope(
    params.apiKeyContext ?? {},
    changesPublishedTargetState(input) ? 'publish' : 'schedule',
  );

  const result = await dependencies.prisma.$transaction((tx) =>
    updateTargetInTransaction(tx, params, input, dependencies),
  );
  if (
    input.scheduledDate !== undefined ||
    input.settings !== undefined ||
    input.timezone !== undefined
  ) {
    await dependencies.publishApprovalsService.invalidatePost(
      params.organizationId,
      params.targetId,
      'Channel destination settings or protected schedule intent changed.',
      params.userId,
    );
  }
  if (result.manualRetryApproval) {
    const approval = result.manualRetryApproval;
    await dependencies.scheduledPostWorkflowQueue.enqueue({
      approvalId: approval.id,
      operationId: approval.operationId,
      organizationId: params.organizationId,
      postId: params.targetId,
      source: 'manual_retry',
      userId: params.userId,
      versionPinId: approval.artifactVersionPinId,
    });
  }
  return result.release;
}

async function updateTargetInTransaction(
  tx: SchedulerTx,
  params: UpdatePostGroupTargetParams,
  input: UpdateChannelTargetInput,
  dependencies: PostGroupTargetOperationDependencies,
) {
  const group = await dependencies.persistenceService.getGroupOrThrow(
    tx,
    params.organizationId,
    params.groupId,
  );
  const existing = await dependencies.persistenceService.getTargetOrThrow(
    tx,
    params.organizationId,
    group.id,
    params.targetId,
  );
  const validation = dependencies.contractService.validateTargetUpdate(
    existing,
    input,
  );
  const { isManualRetry, manualRetryApproval } = await resolveManualRetry(
    {
      existing,
      groupId: params.groupId,
      input,
      organizationId: params.organizationId,
      targetId: params.targetId,
      tx,
      userId: params.userId,
    },
    dependencies,
  );
  const targetMutation = buildTargetMutation(
    input,
    isManualRetry,
    validation,
    dependencies.contractService,
  );

  if (input.executionState !== undefined) {
    await dependencies.postLifecycleService.transition(
      {
        actorId: params.userId,
        error: isManualRetry ? null : input.error,
        groupId: group.id,
        mutation: targetMutation,
        nextState: input.executionState,
        organizationId: params.organizationId,
        postId: existing.id,
        reason: isManualRetry ? 'Manual retry requested' : undefined,
      },
      tx,
    );
  } else {
    await tx.post.updateMany({
      data: {
        ...targetMutation,
        ...(input.error !== undefined && {
          targetError: input.error
            ? dependencies.contractService.toJson(input.error)
            : Prisma.JsonNull,
        }),
      },
      where: scopedWhere(params.organizationId, { id: existing.id }),
    });
  }

  return {
    manualRetryApproval,
    release: await dependencies.persistenceService.hydrateWithDerivedStatus(
      tx,
      params.organizationId,
      group.id,
    ),
  };
}

function buildTargetMutation(
  input: UpdateChannelTargetInput,
  isManualRetry: boolean,
  validation: ReturnType<PostGroupContractService['validateTargetUpdate']>,
  contractService: PostGroupContractService,
): PostLifecycleMutation {
  return {
    ...(isManualRetry && { lastAttemptAt: null, retryCount: 0 }),
    ...(input.externalProviderId !== undefined && {
      externalId: input.externalProviderId,
    }),
    ...(input.externalShortcode !== undefined && {
      externalShortcode: input.externalShortcode,
    }),
    ...(input.idempotencyKey !== undefined && {
      targetIdempotencyKey: input.idempotencyKey,
    }),
    ...(input.lastAttemptAt !== undefined && {
      lastAttemptAt: contractService.toDate(input.lastAttemptAt),
    }),
    ...(input.order !== undefined && { order: input.order }),
    ...(input.publishedAt !== undefined && {
      publishedAt: contractService.toDate(input.publishedAt),
    }),
    ...(input.readiness !== undefined && {
      targetReadiness: input.readiness
        ? contractService.toJson(input.readiness)
        : Prisma.JsonNull,
    }),
    ...(input.retryCount !== undefined && { retryCount: input.retryCount }),
    ...(input.scheduledDate !== undefined && {
      scheduledDate: contractService.toDate(input.scheduledDate),
    }),
    ...(input.settings !== undefined && {
      targetSettings: contractService.toJson(input.settings),
    }),
    ...(input.visibility !== undefined && { visibility: input.visibility }),
    ...(input.timezone !== undefined && { timezone: input.timezone }),
    ...(input.url !== undefined && { url: input.url }),
    ...(input.validationIssues !== undefined && {
      targetValidationIssues: input.validationIssues,
    }),
    ...(input.validationState !== undefined && {
      targetValidationState: input.validationState,
    }),
    ...(validation && {
      targetValidationIssues: contractService.validationIssues(validation),
      targetValidationState: validation.validationState,
    }),
  };
}

async function resolveManualRetry(
  params: ResolveManualRetryParams,
  dependencies: PostGroupTargetOperationDependencies,
): Promise<ManualRetryResolution> {
  const isManualRetry =
    params.existing.targetExecutionState === TargetExecutionState.FAILED &&
    params.input.executionState === TargetExecutionState.SCHEDULED;
  if (isManualRetry) {
    const approval =
      await dependencies.publishApprovalsService.createForCurrentPost({
        actorUserId: params.userId,
        mode: 'scheduled',
        organizationId: params.organizationId,
        postId: params.targetId,
        provenance: {
          releaseId: params.groupId,
          surface: 'post-groups-manual-retry',
        },
        transaction: params.tx,
      });
    const provenance = {
      ...approval.provenance,
      manualRetryCommand: {
        releaseId: params.groupId,
        requestedByUserId: params.userId,
        targetId: params.targetId,
        version: 1,
      },
    };
    await params.tx.publishApproval.update({
      data: { provenance: dependencies.contractService.toJson(provenance) },
      where: { id: approval.id },
    });
    return {
      isManualRetry,
      manualRetryApproval: { ...approval, provenance },
    };
  }

  const approvalId = params.existing.publishApprovalId;
  const canReplay =
    params.existing.targetExecutionState === TargetExecutionState.SCHEDULED &&
    params.input.executionState === TargetExecutionState.SCHEDULED &&
    approvalId;
  if (!canReplay) {
    return { isManualRetry };
  }

  const row = await params.tx.publishApproval.findFirst({
    where: {
      id: approvalId,
      organizationId: params.organizationId,
      postId: params.targetId,
    },
  });
  if (!row) {
    return { isManualRetry };
  }

  const approval = dependencies.publishApprovalsService.toPublicInterface(row);
  const isDurableRetry =
    (approval.status === PublishApprovalStatus.APPROVED ||
      approval.status === PublishApprovalStatus.QUEUED ||
      approval.status === PublishApprovalStatus.FAILED) &&
    Boolean(approval.provenance.manualRetryCommand);

  return isDurableRetry
    ? { isManualRetry, manualRetryApproval: approval }
    : { isManualRetry };
}
