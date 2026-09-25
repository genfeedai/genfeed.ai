import { createHash } from 'node:crypto';
import type { PostGroupsService } from '@api/collections/post-groups/services/post-groups.service';
import { CreatePostDto } from '@api/collections/posts/dto/create-post.dto';
import type { PostsService } from '@api/collections/posts/services/posts.service';
import { resolveConfirmedPublishTargets } from '@api/services/agent-orchestrator/tools/agent-publish-confirmed-targets.util';
import { resolveAgentPublishMediaGate } from '@api/services/agent-orchestrator/tools/agent-publish-media-readiness.util';
import {
  collectInvalidTargetBlockers,
  formatTargetBlockersError,
  readCredentialId,
  toCanonicalChannelTarget,
} from '@api/services/agent-orchestrator/tools/agent-publish-target.util';
import {
  readAgentScheduleValidationError,
  SAFE_AGENT_SCHEDULE_ERROR,
} from '@api/services/agent-orchestrator/tools/agent-schedule-error.util';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { readOptionalString } from '@api/services/agent-orchestrator/tools/agent-tool-parameter-readers';
import type { AutonomousPublishPolicyService } from '@api/services/autonomous-publishing/autonomous-publish-policy.service';
import type { BatchGenerationService } from '@api/services/batch-generation/batch-generation.service';
import {
  AgentAutonomyMode,
  AgentPublishDecision,
  PostVisibility,
  ReleaseStatus,
  TargetExecutionState,
} from '@genfeedai/contracts';
import {
  type AgentPublishPolicyResult,
  evaluateAgentPublishPolicy,
} from '@genfeedai/contracts/api-types/contracts/agent-publish-policy.contract';
import type {
  AgentToolResult,
  IReleaseGroup,
  ScheduleCanonicalPostInput,
} from '@genfeedai/contracts/interfaces';
import type { LoggerService } from '@libs/logger/logger.service';
import { z } from 'zod';

const STRICT_SCHEDULE_DATE_SCHEMA = z.string().datetime({ offset: true });

type PublishRequest = {
  caption: string | undefined;
  platforms: string[];
  requestedScheduledAt: string | undefined;
  requestedTargets: Parameters<
    typeof resolveConfirmedPublishTargets
  >[0]['requestedTargets'];
};

type PublishPolicy = {
  autonomyMode: AgentAutonomyMode;
  result: AgentPublishPolicyResult;
};

export async function createProactiveAgentTextPost(
  params: Record<string, unknown>,
  ctx: ToolExecutionContext,
  visibility: PostVisibility,
  deps: {
    batchGenerationService?: BatchGenerationService;
    postGroupsService: PostGroupsService;
    readPublishRequest: (params: Record<string, unknown>) => PublishRequest;
    resolveBrandCredentials: (params: {
      brandId: unknown;
      organizationId: string;
      platforms?: string[];
    }) => Promise<Array<Record<string, unknown>>>;
    resolvePublishPolicy: (params: {
      brandId?: string;
      channelAllowsAutoPublish: boolean;
      ctx: ToolExecutionContext;
      targets: Array<{ credentialId: string; platform: string }>;
    }) => Promise<PublishPolicy>;
    writePublishAudit: (params: {
      brandId: string | null;
      channels: string[];
      ctx: ToolExecutionContext;
      policy: PublishPolicy;
      postGroupId: string;
    }) => Promise<void>;
  },
): Promise<AgentToolResult> {
  const { caption, platforms, requestedTargets, requestedScheduledAt } =
    deps.readPublishRequest(params);
  const brandId = ctx.validatedScope?.brandId;
  if (
    !brandId ||
    !ctx.runId ||
    !ctx.strategyId ||
    !caption ||
    !platforms.length ||
    !deps.batchGenerationService
  ) {
    return {
      creditsUsed: 0,
      success: false,
      error:
        'Agent drafts require scoped strategy, run, content, connected platforms and review storage.',
    };
  }
  if (
    requestedScheduledAt &&
    (!STRICT_SCHEDULE_DATE_SCHEMA.safeParse(requestedScheduledAt).success ||
      new Date(requestedScheduledAt).getTime() <= Date.now())
  )
    return {
      creditsUsed: 0,
      success: false,
      error: 'scheduledAt must be a future ISO timestamp.',
    };
  const credentials = await deps.resolveBrandCredentials({
    brandId,
    organizationId: ctx.organizationId,
    platforms,
  });
  const credentialsById = new Map(
    credentials.flatMap((credential) => {
      const id = readCredentialId(credential.id);
      return id ? [[id, credential] as const] : [];
    }),
  );
  const resolved = resolveConfirmedPublishTargets({
    credentials,
    credentialsById,
    requestedTargets,
    visibility,
  });
  if ('error' in resolved) return resolved.error;
  if (
    platforms.some(
      (platform) =>
        !resolved.targets.some((target) => target.platform === platform),
    )
  )
    return {
      creditsUsed: 0,
      success: false,
      error: 'Every target platform requires a connected account.',
    };
  const blockers = collectInvalidTargetBlockers({
    caption,
    media: [],
    publishMode: requestedScheduledAt ? 'scheduled' : 'publish_now',
    targets: resolved.payloads.map((target) => ({ ...target, caption })),
    visibility,
  });
  if (blockers.length)
    return {
      creditsUsed: 0,
      success: false,
      error: formatTargetBlockersError(blockers),
    };
  const policy = await deps.resolvePublishPolicy({
    ctx,
    brandId,
    targets: resolved.targets,
    channelAllowsAutoPublish: true,
  });
  const requiresApproval =
    policy.result.decision === AgentPublishDecision.DENIED;
  const scheduledAt = requiresApproval ? undefined : requestedScheduledAt;
  const idempotencyKey = createHash('sha256')
    .update(
      JSON.stringify([
        ctx.organizationId,
        ctx.runId,
        caption,
        resolved.targets,
        requestedScheduledAt,
        visibility,
      ]),
    )
    .digest('hex');
  const release = await deps.postGroupsService.create(
    ctx.organizationId,
    ctx.userId,
    {
      brandId,
      baseContent: caption,
      title: caption.slice(0, 100),
      media: [],
      idempotencyKey,
      status: scheduledAt ? ReleaseStatus.SCHEDULED : ReleaseStatus.DRAFT,
      ...(scheduledAt ? { scheduledDate: scheduledAt } : {}),
      timezone: 'UTC',
      targets: resolved.targets.map((target, order) =>
        toCanonicalChannelTarget({
          ...target,
          order,
          caption,
          scheduledAt,
          visibility,
        }),
      ),
    },
    idempotencyKey,
    {
      source: 'agent',
      agentStrategyId: ctx.strategyId,
      workflowExecutionId: ctx.runId,
      agentThreadId: ctx.threadId,
      agentContextSource: ctx.validatedScope?.source,
      agentContextVersion: ctx.validatedScope?.contextVersion,
    },
  );
  await deps.writePublishAudit({
    brandId,
    channels: platforms,
    ctx,
    policy,
    postGroupId: release.id,
  });
  if (requiresApproval)
    await deps.batchGenerationService.createManualReviewBatch(
      {
        brandId,
        agentStrategyId: ctx.strategyId,
        items: (release.targets ?? []).map((target) => ({
          format: 'post',
          postId: String(target.id),
          platform: String(target.platform),
          caption,
          scheduledDate: requestedScheduledAt,
          workflowExecutionId: ctx.runId,
        })),
      },
      ctx.userId,
      ctx.organizationId,
      `agent-review:${idempotencyKey}`,
    );
  else if (!scheduledAt)
    await deps.postGroupsService.publishNow(
      ctx.organizationId,
      ctx.userId,
      release.id,
    );
  return {
    creditsUsed: 0,
    success: true,
    data: {
      postIds: (release.targets ?? []).map((target) => String(target.id)),
      releaseId: release.id,
      ...(requiresApproval ? { requiredAction: 'approval' } : {}),
    },
  };
}

export async function scheduleAgentPost(
  params: Record<string, unknown>,
  ctx: ToolExecutionContext,
  deps: {
    assertPublishingScope: (
      ctx: ToolExecutionContext,
      resourceBrandId: string | undefined,
      resourceLabel: string,
    ) => Promise<void>;
    autonomousPublishPolicyService?: AutonomousPublishPolicyService;
    logger: LoggerService;
    owner: string;
    postsService: PostsService;
    scheduleCanonicalPost: (
      input: ScheduleCanonicalPostInput,
    ) => Promise<AgentToolResult>;
  },
): Promise<AgentToolResult> {
  const postId = readOptionalString(params.postId);
  const scheduledAt = readOptionalString(params.scheduledAt);
  if (!postId || !scheduledAt) {
    return {
      creditsUsed: 0,
      error: 'postId and scheduledAt are required to schedule a post.',
      success: false,
    };
  }
  if (!STRICT_SCHEDULE_DATE_SCHEMA.safeParse(scheduledAt).success) {
    return {
      creditsUsed: 0,
      error:
        'scheduledAt must be a valid ISO 8601 date and time with an explicit UTC offset.',
      success: false,
    };
  }
  const scheduledDate = new Date(scheduledAt);
  if (scheduledDate.getTime() <= Date.now()) {
    return {
      creditsUsed: 0,
      error: 'scheduledAt must be in the future.',
      success: false,
    };
  }

  let groupId: string | undefined;
  try {
    const post = await deps.postsService.findOne({
      id: postId,
      organizationId: ctx.organizationId,
    });

    if (!post) {
      return {
        creditsUsed: 0,
        error: `Post ${postId} not found`,
        success: false,
      };
    }

    await deps.assertPublishingScope(
      ctx,
      readOptionalString(post.brandId),
      'scheduled post',
    );

    if (ctx.isProactive || ctx.strategyId) {
      const policy = await deps.autonomousPublishPolicyService?.resolveForPost({
        organizationId: ctx.organizationId,
        postId,
        strategyId: ctx.strategyId,
      });
      if (!policy || policy.result.decision === AgentPublishDecision.DENIED) {
        return {
          creditsUsed: 0,
          success: false,
          error: policy?.result.reason ?? 'Publish policy unavailable.',
          data: { id: postId, requiredAction: 'approval' },
        };
      }
    }

    groupId = readOptionalString(post.groupId);
    if (!groupId) {
      return {
        creditsUsed: 0,
        data: {
          id: postId,
          requiredAction: 'create_canonical_release',
        },
        error:
          'This legacy standalone draft cannot be scheduled safely. Open Posts and create a canonical release with an explicit platform and connected account.',
        nextActions: [
          {
            ctas: [{ href: '/content/posts', label: 'Open posts' }],
            description:
              'Choose the destination and connected account in the canonical release composer before scheduling.',
            id: `schedule-legacy-post-${postId}`,
            title: 'Canonical release required',
            type: 'schedule_post_card',
          },
        ],
        success: false,
      };
    }

    return await deps.scheduleCanonicalPost({
      ctx,
      groupId,
      postId,
      scheduledAt: scheduledDate.toISOString(),
    });
  } catch (error: unknown) {
    const validationError = readAgentScheduleValidationError(error);
    if (!validationError) {
      deps.logger.error(
        `Canonical schedule failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        deps.owner,
      );
    }
    return {
      creditsUsed: 0,
      data: { id: postId, ...(groupId ? { releaseId: groupId } : {}) },
      error: validationError ?? SAFE_AGENT_SCHEDULE_ERROR,
      nextActions: [
        {
          ctas: [{ href: '/content/posts', label: 'Review post setup' }],
          description:
            'Verify the release brand, platform, connected account, and future schedule before retrying.',
          id: `schedule-post-failed-${postId}`,
          title: 'Scheduling needs attention',
          type: 'schedule_post_card',
        },
      ],
      success: false,
    };
  }
}

export async function createAgentTextDraft(
  postsService: PostsService,
  params: Record<string, unknown>,
  ctx: ToolExecutionContext,
  visibility: PostVisibility,
): Promise<AgentToolResult> {
  const post = await postsService.create({
    ...(ctx.runId ? { workflowExecutionId: ctx.runId } : {}),
    ...(ctx.strategyId ? { agentStrategyId: ctx.strategyId } : {}),
    agentContextSource: ctx.validatedScope?.source,
    agentContextVersion: ctx.validatedScope?.contextVersion,
    agentThreadId: ctx.validatedScope?.threadId,
    brandId: ctx.validatedScope?.brandId,
    description: params.content as string,
    label: ((params.content as string) || '').substring(0, 100),
    organizationId: ctx.organizationId,
    source: 'agent',
    targetExecutionState: TargetExecutionState.DRAFT,
    userId: ctx.userId,
    visibility,
  } as unknown as CreatePostDto);

  return {
    creditsUsed: 0,
    data: {
      id: String(post.id),
      executionState: TargetExecutionState.DRAFT,
      visibility,
    },
    success: true,
  };
}

export async function finishConfirmedPublish(input: {
  autoPublishPolicy: { policyId: string };
  baseContent: string;
  batchGenerationService?: BatchGenerationService;
  contentId: string;
  createdPlatforms: string[];
  ctx: ToolExecutionContext;
  effectiveScheduledAt: string | undefined;
  idempotencyKey: string;
  ingredientBrandId: string | undefined;
  mediaGate: {
    cardData: Awaited<
      ReturnType<typeof resolveAgentPublishMediaGate>
    >['cardData'];
  };
  missingPlatforms: string[];
  postGroupsService: PostGroupsService;
  postingSetId?: string;
  publishPolicy: { result: { reason: string } };
  release: IReleaseGroup;
  requiresApproval: boolean;
  scheduledAt: string | undefined;
  shouldPublishNow: boolean;
}): Promise<AgentToolResult> {
  const {
    autoPublishPolicy,
    baseContent,
    contentId,
    createdPlatforms,
    ctx,
    effectiveScheduledAt,
    idempotencyKey,
    ingredientBrandId,
    mediaGate,
    missingPlatforms,
    postingSetId,
    publishPolicy,
    release,
    requiresApproval,
    scheduledAt,
    shouldPublishNow,
  } = input;
  let canonicalRelease = release;
  if (shouldPublishNow) {
    try {
      canonicalRelease = await input.postGroupsService.publishNow(
        ctx.organizationId,
        ctx.userId,
        release.id,
      );
    } catch (error) {
      return {
        creditsUsed: 0,
        error:
          error instanceof Error
            ? error.message
            : 'The release could not be published.',
        success: false,
      };
    }
  }
  const groupId = canonicalRelease.id;
  const postIds = (canonicalRelease.targets ?? []).map((target) =>
    String(target.id),
  );
  if (requiresApproval && ctx.isProactive) {
    if (!input.batchGenerationService || !ingredientBrandId) {
      throw new Error(
        'Agent review queue is unavailable. Drafts were retained.',
      );
    }
    await input.batchGenerationService.createManualReviewBatch(
      {
        brandId: ingredientBrandId,
        agentStrategyId: ctx.strategyId,
        items: (canonicalRelease.targets ?? []).map((target) => ({
          format: 'post',
          postId: String(target.id),
          platform: String(target.platform),
          caption: baseContent,
          ingredientId: contentId,
          workflowExecutionId: ctx.runId,
          scheduledDate: scheduledAt,
        })),
      },
      ctx.userId,
      ctx.organizationId,
      `agent-review:${idempotencyKey}`,
    );
  }
  const description = effectiveScheduledAt
    ? `Scheduled ${postIds.length} post${postIds.length === 1 ? '' : 's'} for ${createdPlatforms.join(', ')}.`
    : requiresApproval
      ? publishPolicy.result.reason
      : `Queued ${postIds.length} post${postIds.length === 1 ? '' : 's'} for publishing on ${createdPlatforms.join(', ')}.`;

  return {
    creditsUsed: 0,
    data: {
      autoPublishPolicyId: autoPublishPolicy.policyId,
      contentId,
      createdPlatforms,
      ...mediaGate.cardData,
      missingPlatforms,
      ...(postingSetId ? { postingSetId } : {}),
      postIds,
      ...(requiresApproval ? { requiredAction: 'approval' } : {}),
      scheduledAt,
      totalCreated: postIds.length,
    },
    nextActions: [
      {
        ctas: [
          { href: '/content/posts', label: 'Open posts' },
          ...(postIds[0]
            ? [
                {
                  href: `/analytics/posts?postId=${postIds[0]}`,
                  label: 'Open analytics',
                },
              ]
            : []),
        ],
        description,
        id: requiresApproval
          ? `publish-approval-${groupId}`
          : `published-posts-${groupId}`,
        requiresConfirmation: requiresApproval,
        title: effectiveScheduledAt
          ? 'Posts scheduled'
          : requiresApproval
            ? 'Publish requires approval'
            : 'Posts queued',
        type: requiresApproval
          ? ('publish_post_card' as const)
          : ('content_preview_card' as const),
      },
    ],
    success: true,
  };
}

export function fallbackConfirmedPublishPolicy(ctx: ToolExecutionContext): {
  autonomyMode: AgentAutonomyMode;
  result: AgentPublishPolicyResult;
} {
  const confirmed = ctx.confirmationOrigin === 'thread-ui-action';
  const autonomyMode = confirmed
    ? AgentAutonomyMode.AUTO_PUBLISH
    : AgentAutonomyMode.SUPERVISED;
  return {
    autonomyMode,
    result: evaluateAgentPublishPolicy({
      autonomyMode,
      brandAllowsAutoPublish: confirmed,
      channelAllowsAutoPublish: confirmed,
    }),
  };
}
