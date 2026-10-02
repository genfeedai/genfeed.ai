import type { PostDocument } from '@api/collections/posts/post.schema';
import {
  assertPublishTarget,
  assertValidChannelTargetSchedule,
  assertVisibilitySupported,
} from '@api/collections/posts/services/channel-target-schedule-validation.util';
import type { PostUpdateInput } from '@api/collections/posts/services/posts.service';
import type { PublishApprovalsService } from '@api/collections/publish-approvals/services/publish-approvals.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { pickDefinedFields } from '@api/shared/utils/object/pick-defined-fields.util';
import { TimezoneUtil } from '@api/shared/utils/timezone/timezone.util';
import {
  fromPrismaCredentialPlatform,
  TargetExecutionState,
} from '@genfeedai/contracts';
import type { Prisma } from '@genfeedai/prisma';
import type { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, ConflictException } from '@nestjs/common';

export const POST_SCALAR_FIELDS = [
  'agentContextSource',
  'agentContextVersion',
  'agentStrategyId',
  'agentThreadId',
  'analyticsCollectedAt',
  'analyticsCollectionAttemptKey',
  'analyticsCollectionError',
  'analyticsCollectionRequestedAt',
  'analyticsCollectionState',
  'analyticsNextCollectAt',
  'brandId',
  'campaignId',
  'category',
  'contentRunId',
  'credentialId',
  'creativeVersion',
  'description',
  'entityArticleId',
  'entityIngredientId',
  'entityModel',
  'externalId',
  'externalShortcode',
  'format',
  'generationId',
  'groupId',
  'hookVersion',
  'knowledgeReceipts',
  'isAnalyticsEnabled',
  'isDeleted',
  'isRepeat',
  'isShareToFeedSelected',
  'label',
  'lastAttemptAt',
  'maxRepeats',
  'nextScheduledDate',
  'order',
  'originalPostId',
  'organizationId',
  'parentId',
  'personaId',
  'platform',
  'promptUsed',
  'publicationDate',
  'publishedAt',
  'publishApprovalId',
  'publishIntent',
  'quoteTweetId',
  'repeatCount',
  'repeatDaysOfWeek',
  'repeatEndDate',
  'repeatFrequency',
  'repeatInterval',
  'reviewFeedback',
  'reviewBatchId',
  'reviewDecision',
  'reviewEvents',
  'reviewItemId',
  'reviewVersionPinId',
  'reviewedAt',
  'retryCount',
  'scheduleSlot',
  'scheduledDate',
  'seoBreakdown',
  'seoScore',
  'source',
  'sourceActionId',
  'sourceWorkflowId',
  'sourceWorkflowName',
  'targetExecutionState',
  'targetAttachments',
  'targetError',
  'targetIdempotencyKey',
  'targetReadiness',
  'targetSettings',
  'targetValidationIssues',
  'targetValidationState',
  'threadDelayMinutes',
  'timezone',
  'uploadedAt',
  'url',
  'userId',
  'variantId',
  'visibility',
  'workflowExecutionId',
] as const;

// Fields that can turn an otherwise-valid scheduled target invalid: a media
// swap, a credential swap onto a different platform, a caption edit, or a
// settings change. `visibility` is handled separately (`requestedVisibility`
// already triggers a re-check). Touching any of these on a post that is
// already SCHEDULED — not just one this call is newly scheduling — must
// re-run the channel contract (#5193 acceptance: "editing media or the
// credential on a scheduled post re-validates it").
const SCHEDULE_REVALIDATION_FIELDS = new Set<string>([
  'category',
  'credentialId',
  'description',
  'ingredients',
  'platform',
  'targetSettings',
]);

const PUBLISH_APPROVAL_MATERIAL_FIELDS = new Set<string>([
  'category',
  'credentialId',
  'description',
  'format',
  'ingredients',
  'isRepeat',
  'isShareToFeedSelected',
  'label',
  'maxRepeats',
  'parentId',
  'platform',
  'publishIntent',
  'repeatDaysOfWeek',
  'repeatEndDate',
  'repeatFrequency',
  'repeatInterval',
  'scheduledDate',
  'tags',
  'targetExecutionState',
  'timezone',
  'visibility',
]);

/**
 * The `PostsService` collaborators `preparePostPatchWrite` needs. Passed
 * explicitly rather than reached through `this` so the patch-time validation
 * and write planning stay outside the service file, which is at its
 * runtime-complexity ceiling.
 */
export type PostPatchServiceContext = {
  findOne: (params: Record<string, unknown>) => Promise<PostDocument | null>;
  logger: Pick<LoggerService, 'log'>;
  prisma: Pick<PrismaService, 'credential' | 'post'>;
  transaction?: Prisma.TransactionClient;
  organizationId?: string;
  childIds?: readonly string[];
  publishApprovalsService?: Pick<PublishApprovalsService, 'assertPostMutable'>;
};

export type PatchApprovalContext = {
  organizationId: string;
  publishApprovalId: string | null;
} | null;

export type PreparedPostPatch = {
  approvalContext: PatchApprovalContext;
  currentPost: PostDocument | null;
  isPublishingPost: boolean;
  prismaWriteData: Record<string, unknown>;
  requestedExecutionState: TargetExecutionState | undefined;
};

async function readPostPatchApprovalContext(
  context: PostPatchServiceContext,
  id: string,
  changesApprovalScope: boolean,
): Promise<PatchApprovalContext> {
  const approvalContext = changesApprovalScope
    ? await context.prisma.post.findFirst({
        select: { organizationId: true, publishApprovalId: true },
        where: {
          id,
          isDeleted: false,
          ...(context.organizationId
            ? { organizationId: context.organizationId }
            : {}),
        },
      })
    : null;
  if (approvalContext?.publishApprovalId && context.publishApprovalsService) {
    await context.publishApprovalsService.assertPostMutable(
      approvalContext.organizationId,
      id,
      context.transaction,
    );
  }
  return approvalContext;
}

/**
 * Resolve every piece of state `patch()` needs before it writes — the
 * approval context, the credential-derived platform, the current row (when
 * an edit could affect an already-scheduled target), the channel-contract
 * re-check (#5193), the Prisma write payload, and the child-post schedule
 * cascade — and perform the cascade write itself. `patch()` only applies the
 * resulting payload to the post itself and runs its post-write side effects.
 */
export async function preparePostPatchWrite(
  context: PostPatchServiceContext,
  id: string,
  dto: PostUpdateInput,
): Promise<PreparedPostPatch> {
  const requestedExecutionState = dto.targetExecutionState;
  const requestedVisibility = dto.visibility;
  const isPublishingPost =
    requestedExecutionState === TargetExecutionState.PUBLISHED;
  const changesApprovalScope = Object.keys(dto).some((key) =>
    PUBLISH_APPROVAL_MATERIAL_FIELDS.has(key),
  );
  const approvalContext = await readPostPatchApprovalContext(
    context,
    id,
    changesApprovalScope,
  );

  let resolvedPlatform: string | undefined;
  if (dto.credentialId && approvalContext) {
    const credential = await context.prisma.credential.findFirst({
      select: { platform: true },
      where: {
        id: dto.credentialId,
        isConnected: true,
        isDeleted: false,
        organizationId: approvalContext.organizationId,
      },
    });
    if (!credential) {
      throw new BadRequestException(
        'The selected publishing credential is unavailable for this organization.',
      );
    }
    const domainPlatform = fromPrismaCredentialPlatform(credential.platform);
    if (!domainPlatform) {
      throw new BadRequestException(
        `Unknown credential platform: ${credential.platform}`,
      );
    }
    resolvedPlatform = domainPlatform;
  }

  let currentPost: PostDocument | null = null;
  // Broader than the credential/platform-presence check below: also loads
  // the current row when the edit could invalidate an *already* scheduled
  // target (media, credential, caption, settings), not only when this call
  // is the one newly setting SCHEDULED.
  const touchesScheduleRevalidationFields = Object.keys(dto).some((key) =>
    SCHEDULE_REVALIDATION_FIELDS.has(key),
  );

  if (
    requestedExecutionState === TargetExecutionState.SCHEDULED ||
    isPublishingPost ||
    requestedVisibility !== undefined ||
    touchesScheduleRevalidationFields
  ) {
    currentPost = await context.findOne({ id });
    if (currentPost) {
      const targetCredentialId = dto.credentialId ?? currentPost.credentialId;
      const targetPlatform = resolvedPlatform ?? currentPost.platform;
      assertPublishTarget(
        requestedExecutionState,
        targetCredentialId,
        targetPlatform,
      );
    }
  }

  if (requestedVisibility !== undefined && currentPost) {
    const targetPlatform = resolvedPlatform ?? currentPost.platform;
    assertVisibilitySupported(requestedVisibility, targetPlatform);
  }

  // Choke point for #5193: this covers both a PATCH that newly schedules a
  // post and one that edits material fields (media, credential, caption,
  // settings) on a post that is already SCHEDULED — the latter is the
  // "editing media or the credential on a scheduled post re-validates it"
  // acceptance criterion, since `patch()` writes directly and never routes
  // through `PostLifecycleService`.
  const effectiveExecutionState =
    requestedExecutionState ?? currentPost?.targetExecutionState;
  if (
    currentPost &&
    effectiveExecutionState === TargetExecutionState.SCHEDULED
  ) {
    const targetPlatform = resolvedPlatform ?? currentPost.platform;
    assertValidChannelTargetSchedule({
      caption: dto.description ?? currentPost.description,
      category: (dto.category as string | undefined) ?? currentPost.category,
      credentialId: dto.credentialId ?? currentPost.credentialId,
      ingredients: dto.ingredients ?? currentPost.ingredients,
      platform: targetPlatform,
      publishMode: 'scheduled',
      settings:
        (dto.targetSettings as Record<string, unknown> | undefined) ??
        (currentPost.targetSettings as Record<string, unknown> | undefined),
      visibility: requestedVisibility ?? currentPost.visibility,
    });
  }

  const { ingredients, tags } = dto;
  const dtoRecord = dto as unknown as Record<string, unknown>;

  const prismaWriteData: Record<string, unknown> = {
    ...pickDefinedFields(dtoRecord, POST_SCALAR_FIELDS),
    ...(resolvedPlatform !== undefined && { platform: resolvedPlatform }),
    ...(ingredients !== undefined && {
      ingredients: { set: ingredients.map((entryId) => ({ id: entryId })) },
    }),
    ...(tags !== undefined && {
      tags: { set: tags.map((entryId) => ({ id: entryId })) },
    }),
  };
  if (requestedExecutionState) {
    prismaWriteData.targetExecutionState = requestedExecutionState;
  }
  if (requestedVisibility) {
    prismaWriteData.visibility = requestedVisibility;
  }

  applyPreparedTimezone(context, dto, prismaWriteData);

  await applyPreparedChildSchedule(
    context,
    id,
    dto,
    currentPost,
    requestedExecutionState,
    resolvedPlatform,
    prismaWriteData,
  );

  return {
    approvalContext,
    currentPost,
    isPublishingPost,
    prismaWriteData,
    requestedExecutionState,
  };
}

async function applyPreparedChildSchedule(
  context: PostPatchServiceContext,
  id: string,
  dto: PostUpdateInput,
  currentPost: PostDocument | null,
  requestedExecutionState: TargetExecutionState | undefined,
  resolvedPlatform: string | undefined,
  prismaWriteData: Record<string, unknown>,
): Promise<void> {
  // If parent post is being scheduled, automatically schedule all children
  if (
    requestedExecutionState === TargetExecutionState.SCHEDULED &&
    currentPost &&
    !currentPost.parentId
  ) {
    const updateResult = await context.prisma.post.updateMany({
      data: {
        credentialId: dto.credentialId ?? currentPost.credentialId,
        platform: resolvedPlatform ?? currentPost.platform,
        targetExecutionState: TargetExecutionState.SCHEDULED,
        ...(prismaWriteData.scheduledDate
          ? { scheduledDate: prismaWriteData.scheduledDate as Date }
          : {}),
      },
      where: {
        isDeleted: false,
        organizationId: currentPost.organizationId,
        parentId: id,
        ...(context.childIds ? { id: { in: [...context.childIds] } } : {}),
        targetExecutionState: {
          not: TargetExecutionState.PUBLISHED,
        },
      },
    });

    if (context.childIds && updateResult.count !== context.childIds.length)
      throw new ConflictException(
        'Post child schedule selection changed during mutation.',
      );
    context.logger.log(`Auto-scheduled children for parent post ${id}`, {
      childrenUpdated: updateResult.count,
      parentId: id,
      executionState: TargetExecutionState.SCHEDULED,
    });
  }
}

function applyPreparedTimezone(
  context: PostPatchServiceContext,
  dto: PostUpdateInput,
  prismaWriteData: Record<string, unknown>,
): void {
  // Convert scheduledDate from user timezone to UTC if timezone is provided
  if (dto.scheduledDate && dto.timezone) {
    const convertedDate = TimezoneUtil.convertToUTC(
      new Date(dto.scheduledDate),
      dto.timezone,
    );

    context.logger.log(
      `Converting scheduledDate from ${dto.timezone} to UTC: ${dto.scheduledDate} → ${convertedDate.toISOString()}`,
    );

    prismaWriteData.scheduledDate = convertedDate;
  }
}
