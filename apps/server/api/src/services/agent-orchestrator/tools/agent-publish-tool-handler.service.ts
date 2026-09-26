import { createHash, randomUUID } from 'node:crypto';
import { AgentPublishAuditsService } from '@api/collections/agent-publish-audits/services/agent-publish-audits.service';
import { AgentStrategiesService } from '@api/collections/agent-strategies/services/agent-strategies.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { PostGroupsService } from '@api/collections/post-groups/services/post-groups.service';
import { PostRepurposeService } from '@api/collections/posts/services/post-repurpose.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { AgentScopeContextService } from '@api/index';
import { resolveConfirmedPublishTargets } from '@api/services/agent-orchestrator/tools/agent-publish-confirmed-targets.util';
import {
  blockMcpCreatePost,
  isMcpActionOrigin,
  mcpDraftOnlyResult,
  readPublishContentId,
} from '@api/services/agent-orchestrator/tools/agent-publish-mcp-draft-only.util';
import { resolveAgentPublishMediaGate } from '@api/services/agent-orchestrator/tools/agent-publish-media-readiness.util';
import {
  createAgentTextDraft,
  createProactiveAgentTextPost,
  fallbackConfirmedPublishPolicy,
  finishConfirmedPublish,
  scheduleAgentPost,
} from '@api/services/agent-orchestrator/tools/agent-publish-post-actions';
import {
  buildAgentPublishTargetProposals,
  collectInvalidTargetBlockers,
  formatTargetBlockersError,
  parseAgentPublishTargetPayloads,
  readCredentialId,
  readDomainPlatform,
  resolvePublishMediaKind,
  resolvePublishValidationMedia,
  toCanonicalChannelTarget,
} from '@api/services/agent-orchestrator/tools/agent-publish-target.util';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { readOptionalString } from '@api/services/agent-orchestrator/tools/agent-tool-parameter-readers';
import {
  persistPendingToolConfirmation,
  verifyPendingToolConfirmation,
} from '@api/services/agent-orchestrator/tools/agent-tool-pending-confirmation.util';
import { AutonomousPublishPolicyService } from '@api/services/autonomous-publishing/autonomous-publish-policy.service';
import { BatchGenerationService } from '@api/services/batch-generation/batch-generation.service';
import { CacheService } from '@api/services/cache/cache.service';
import { MediaReadinessService } from '@api/services/media-readiness/media-readiness.service';
import {
  ActivitySource,
  AgentAutonomyMode,
  AgentPublishDecision,
  CredentialPlatform,
  PostRepurposeMode,
  PostStatus,
  PostVisibility,
  parsePlatform,
  ReleaseStatus,
  TargetExecutionState,
} from '@genfeedai/contracts';
import { evaluateAgentAutoPublishPolicies } from '@genfeedai/contracts/api-types/contracts/agent-auto-publish.contract';
import { type AgentPublishPolicyResult } from '@genfeedai/contracts/api-types/contracts/agent-publish-policy.contract';
import { BATCH_CAPTION_BASE_CREDITS } from '@genfeedai/contracts/constants';
import {
  type AgentPublishIdempotencyInput,
  type AgentToolResult,
  type AgentUiAction,
  type PublishConfirmedContentInput,
  type ScheduleCanonicalPostInput,
} from '@genfeedai/contracts/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import {
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Optional,
} from '@nestjs/common';
import { z } from 'zod';

type IngredientsServiceLike = {
  findOne: (query: Record<string, unknown>) => Promise<unknown>;
};

type CredentialsServiceLike = {
  find: (filter: Record<string, unknown>) => Promise<unknown[]>;
};
/**
 * Agent publishing tools: confirmed content publish, schedule, create_post, schedule_post.
 * Extracted/extended from AgentToolExecutorService per #519/#520.
 */
@Injectable()
export class AgentPublishToolHandler {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly postGroupsService: PostGroupsService,
    private readonly postsService: PostsService,
    private readonly loggerService: LoggerService,
    @Optional()
    private readonly ingredientsService?: IngredientsServiceLike,
    @Optional()
    private readonly credentialsService?: CredentialsServiceLike,
    @Optional()
    private readonly agentScopeContextService?: AgentScopeContextService,
    @Optional()
    private readonly postRepurposeService?: PostRepurposeService,
    @Optional()
    private readonly creditsUtilsService?: CreditsUtilsService,
    @Optional()
    _agentStrategiesService?: AgentStrategiesService,
    @Optional()
    private readonly agentPublishAuditsService?: AgentPublishAuditsService,
    @Optional()
    @Inject(CacheService)
    private readonly cacheService?: CacheService,
    @Optional()
    @Inject(MediaReadinessService)
    private readonly mediaReadinessService?: MediaReadinessService,
    @Optional()
    private readonly autonomousPublishPolicyService?: AutonomousPublishPolicyService,
    @Optional()
    private readonly batchGenerationService?: BatchGenerationService,
  ) {}

  async scheduleCanonicalPost(
    input: ScheduleCanonicalPostInput,
  ): Promise<AgentToolResult> {
    const release = await this.postGroupsService.scheduleTarget(
      input.ctx.organizationId,
      input.ctx.userId,
      input.groupId,
      input.postId,
      input.scheduledAt,
      {
        agentContextSource: input.ctx.validatedScope?.source,
        agentContextVersion: input.ctx.validatedScope?.contextVersion,
        workflowExecutionId: input.ctx.runId,
        agentStrategyId: input.ctx.strategyId,
        agentThreadId: input.ctx.validatedScope?.threadId,
      },
    );
    const target = release.targets?.find(
      (candidate) => candidate.id === input.postId,
    );
    if (!target || target.executionState !== TargetExecutionState.SCHEDULED) {
      throw new ConflictException(
        'Canonical scheduler did not return the scheduled release target.',
      );
    }

    return {
      creditsUsed: 1,
      data: {
        id: input.postId,
        releaseId: release.id,
        scheduledAt: target.scheduledAt ?? input.scheduledAt,
        status: target.executionState,
      },
      nextActions: [
        {
          ctas: [{ href: '/content/posts', label: 'Open posts' }],
          description:
            'The canonical release target is approval-backed and will enter the normal publish queue when due.',
          id: `scheduled-post-${input.postId}`,
          scheduledAt: target.scheduledAt ?? input.scheduledAt,
          title: 'Post scheduled',
          type: 'schedule_post_card',
        },
      ],
      success: true,
    };
  }

  async publishConfirmedContent(
    input: PublishConfirmedContentInput,
  ): Promise<AgentToolResult> {
    const {
      caption,
      contentId,
      credentials,
      ctx,
      ingredient,
      platforms,
      postingSetId,
      scheduledAt,
      sourceActionId,
      targets: requestedTargets,
      timezone,
      visibility,
    } = input;

    if (credentials.length === 0) {
      return {
        creditsUsed: 0,
        error:
          'No connected social accounts are available for the selected platforms.',
        success: false,
      };
    }
    const credentialsById = new Map(
      credentials.flatMap((credential) => {
        const credentialId = readCredentialId(credential.id);
        return credentialId ? [[credentialId, credential] as const] : [];
      }),
    );
    const resolvedTargets = resolveConfirmedPublishTargets({
      credentials,
      credentialsById,
      requestedTargets,
      visibility,
    });
    if ('error' in resolvedTargets) {
      return resolvedTargets.error;
    }

    const createdPlatforms = Array.from(
      new Set(resolvedTargets.targets.map((target) => String(target.platform))),
    );
    const missingPlatforms = platforms.filter(
      (platform) => !createdPlatforms.includes(platform),
    );
    if (missingPlatforms.length > 0) {
      return {
        creditsUsed: 0,
        data: {
          availablePlatforms: createdPlatforms,
          contentId,
          missingPlatforms,
        },
        error: `Missing connected accounts for: ${missingPlatforms.join(', ')}.`,
        success: false,
      };
    }

    const baseContent = this.resolvePublishBaseContent(caption, ingredient);
    const media = resolvePublishValidationMedia(ingredient, contentId);
    const publishMode = scheduledAt ? 'scheduled' : 'publish_now';
    const targetsWithCaptions = resolvedTargets.payloads.map((target) => ({
      ...target,
      caption: target.caption ?? baseContent,
    }));
    const invalidTargets = collectInvalidTargetBlockers({
      caption: baseContent,
      media,
      publishMode,
      targets: targetsWithCaptions,
      visibility,
    });
    if (invalidTargets.length > 0) {
      return {
        creditsUsed: 0,
        data: {
          contentId,
          targetBlockers: invalidTargets,
        },
        error: formatTargetBlockersError(invalidTargets),
        success: false,
      };
    }

    const mediaGate = await resolveAgentPublishMediaGate({
      contentId,
      gate: this.mediaReadinessService,
      media,
      organizationId: ctx.organizationId,
      platforms: createdPlatforms,
    });
    if (mediaGate.blockedResult) {
      return mediaGate.blockedResult;
    }

    const ingredientBrandId = readOptionalString(ingredient.brandId);
    const publishPolicy = await this.resolvePublishPolicy({
      assetIds: mediaGate.assetIds,
      brandId: ingredientBrandId,
      targets: resolvedTargets.targets,
      channelAllowsAutoPublish: resolvedTargets.targets.every((target) =>
        this.isCredentialConnected(credentialsById.get(target.credentialId)),
      ),
      ctx,
    });
    const requiresApproval =
      publishPolicy.result.decision === AgentPublishDecision.DENIED;
    const maySchedule =
      !requiresApproval || ctx.confirmationOrigin === 'thread-ui-action';
    const effectiveScheduledAt = maySchedule ? scheduledAt : undefined;
    const autoPublishPolicy = evaluateAgentAutoPublishPolicies({
      autonomyMode: ctx.autonomyMode,
      brandAutoPublishEnabled: ctx.confirmationOrigin === 'thread-ui-action',
      channels: createdPlatforms,
    });

    const canonicalTargets = resolvedTargets.targets.map((target, order) =>
      toCanonicalChannelTarget({
        attachments: targetsWithCaptions[order]?.attachments,
        caption: targetsWithCaptions[order]?.caption,
        credentialId: target.credentialId,
        order,
        platform: target.platform,
        scheduledAt: maySchedule
          ? (targetsWithCaptions[order]?.scheduledAt ?? effectiveScheduledAt)
          : undefined,
        settings: {
          ...(targetsWithCaptions[order]?.settings ?? {}),
          ...(postingSetId ? { postingSetId } : {}),
          autoPublishPolicyId: autoPublishPolicy.policyId,
        },
        timezone: targetsWithCaptions[order]?.timezone ?? timezone,
        visibility: targetsWithCaptions[order]?.visibility ?? visibility,
      }),
    );

    const idempotencyKey = this.buildIdempotencyKey({
      baseContent,
      contentId,
      organizationId: ctx.organizationId,
      platforms,
      scheduledAt,
      sourceActionId,
      targets: targetsWithCaptions,
      threadId: ctx.threadId,
      userId: ctx.userId,
      visibility,
    });
    const mediaKind = resolvePublishMediaKind(ingredient.category);
    const shouldPublishNow =
      !scheduledAt &&
      publishPolicy.result.decision === AgentPublishDecision.PERMITTED;
    const release = await this.postGroupsService.create(
      ctx.organizationId,
      ctx.userId,
      {
        baseContent,
        brandId: ingredientBrandId,
        idempotencyKey,
        media: [
          {
            assetId: contentId,
            ...(mediaKind ? { kind: mediaKind } : {}),
          },
        ],
        ...(postingSetId ? { postingSetId } : {}),
        ...(effectiveScheduledAt
          ? {
              scheduledDate: effectiveScheduledAt,
              status: ReleaseStatus.SCHEDULED,
            }
          : { status: ReleaseStatus.DRAFT }),
        targets: canonicalTargets,
        timezone: timezone ?? 'UTC',
        title: baseContent.slice(0, 100),
      },
      idempotencyKey,
      {
        agentContextSource: ctx.validatedScope?.source,
        agentContextVersion: ctx.validatedScope?.contextVersion,
        workflowExecutionId: ctx.runId,
        agentStrategyId: ctx.strategyId,
        agentThreadId: ctx.validatedScope?.threadId,
        autoPublishPolicyId: autoPublishPolicy.policyId,
        ...(postingSetId ? { postingSetId } : {}),
        source: 'agent',
        sourceActionId,
      },
    );
    await this.writePublishAudit({
      brandId: ingredientBrandId ?? null,
      channels: createdPlatforms,
      ctx,
      policy: publishPolicy,
      postGroupId: release.id,
    });
    return finishConfirmedPublish({
      autoPublishPolicy,
      baseContent,
      batchGenerationService: this.batchGenerationService,
      contentId,
      createdPlatforms,
      ctx,
      effectiveScheduledAt,
      idempotencyKey,
      ingredientBrandId,
      mediaGate,
      missingPlatforms,
      postGroupsService: this.postGroupsService,
      postingSetId,
      publishPolicy,
      release,
      requiresApproval,
      scheduledAt,
      shouldPublishNow,
    });
  }

  private isCredentialConnected(credential: unknown): boolean {
    if (!credential || typeof credential !== 'object') {
      return false;
    }
    const record = credential as Record<string, unknown>;
    if (typeof record.isConnected === 'boolean') {
      return record.isConnected;
    }
    return true;
  }

  private async resolvePublishPolicy(params: {
    assetIds?: string[];
    brandId?: string;
    targets: Array<{ credentialId: string; platform: string }>;
    channelAllowsAutoPublish: boolean;
    ctx: ToolExecutionContext;
  }): Promise<{
    autonomyMode: AgentAutonomyMode;
    result: AgentPublishPolicyResult;
  }> {
    const service = this.autonomousPublishPolicyService;
    const brandId = params.brandId;
    if (service && brandId && params.targets.length) {
      const policies = await Promise.all(
        params.targets.map((target) =>
          service.resolveForTarget({
            assetIds: params.assetIds,
            organizationId: params.ctx.organizationId,
            brandId,
            strategyId: params.ctx.strategyId,
            platform: String(target.platform),
            credentialId: target.credentialId,
            channelAllowsAutoPublish: params.channelAllowsAutoPublish,
          }),
        ),
      );
      const resolved =
        policies.find(
          (policy) => policy.result.decision === AgentPublishDecision.DENIED,
        ) ?? policies[0];
      if (resolved) return resolved;
    }
    return fallbackConfirmedPublishPolicy(params.ctx);
  }

  private async writePublishAudit(params: {
    brandId: string | null;
    channels: string[];
    ctx: ToolExecutionContext;
    policy: {
      autonomyMode: AgentAutonomyMode;
      result: AgentPublishPolicyResult;
    };
    postGroupId: string;
  }): Promise<void> {
    if (!this.agentPublishAuditsService) {
      return;
    }
    await this.agentPublishAuditsService.createAudit({
      workflowExecutionId: params.ctx.runId ?? null,
      agentStrategyId: params.ctx.strategyId ?? null,
      agentThreadId: params.ctx.validatedScope?.threadId ?? null,
      autonomyMode: params.policy.autonomyMode,
      brandId: params.brandId,
      channel: params.channels.join(',') || null,
      decision: params.policy.result.decision,
      organizationId: params.ctx.organizationId,
      policyName: params.policy.result.policyName,
      postGroupId: params.postGroupId,
      reason: params.policy.result.reason,
      userId: params.ctx.userId,
    });
  }

  private buildIdempotencyKey(input: AgentPublishIdempotencyInput): string {
    const digest = createHash('sha256')
      .update(
        JSON.stringify({
          ...input,
          platforms: [...input.platforms].sort(),
        }),
      )
      .digest('hex');
    return `agent-publish:${digest}`;
  }

  private resolvePublishBaseContent(
    caption: string | undefined,
    ingredient: Record<string, unknown>,
  ): string {
    const candidates = [
      caption,
      readOptionalString(ingredient.label),
      readOptionalString(ingredient.description),
      readOptionalString(ingredient.assetLabel),
      readOptionalString(ingredient.generationPrompt),
    ];
    const resolved = candidates.find((candidate) => Boolean(candidate?.trim()));
    if (resolved) {
      return resolved.trim();
    }

    const category = readOptionalString(ingredient.category) ?? 'content';
    return `Selected ${category} asset`;
  }

  private readPublishRequest(params: Record<string, unknown>): {
    caption: string | undefined;
    platforms: string[];
    requestedScheduledAt: string | undefined;
    requestedTargets: ReturnType<typeof parseAgentPublishTargetPayloads>;
  } {
    const caption =
      typeof params.caption === 'string'
        ? params.caption.trim()
        : typeof params.content === 'string'
          ? params.content.trim()
          : typeof params.textContent === 'string'
            ? params.textContent.trim()
            : undefined;
    const requestedTargets = parseAgentPublishTargetPayloads(params.targets);
    const platforms = this.normalizePlatforms(
      requestedTargets.length > 0
        ? requestedTargets.map((target) => target.platform)
        : Array.isArray(params.platforms)
          ? params.platforms
          : typeof params.platform === 'string'
            ? [params.platform]
            : [],
    );
    const requestedScheduledAt =
      typeof params.scheduledAt === 'string' && params.scheduledAt.trim()
        ? params.scheduledAt.trim()
        : undefined;

    return { caption, platforms, requestedScheduledAt, requestedTargets };
  }

  // Only a resumed publish card needs its sourceActionId verified against a
  // persisted confirmation; an auto-publish-permitted call never showed one.
  private async rejectUnverifiedPublishCard(
    sourceActionId: string,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult | null> {
    if (!this.cacheService) {
      throw new InternalServerErrorException(
        'Publish confirmation persistence is unavailable.',
      );
    }
    const isVerifiedConfirmation = await verifyPendingToolConfirmation(
      this.cacheService,
      {
        organizationId: ctx.organizationId,
        sourceActionId,
        threadId: ctx.threadId ?? '',
        toolName: 'create_post',
      },
    );
    if (isVerifiedConfirmation) {
      return null;
    }

    return {
      creditsUsed: 0,
      error: 'sourceActionId does not match a persisted publish card.',
      success: false,
    };
  }

  private normalizePlatforms(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return Array.from(
      new Set(
        value
          .filter(
            (platform): platform is string => typeof platform === 'string',
          )
          .map((platform) => platform.trim().toLowerCase())
          .filter((platform) => platform.length > 0),
      ),
    );
  }

  private async resolveIngredientForContent(
    contentId: string,
    organizationId: string,
  ): Promise<Record<string, unknown> | null> {
    if (!this.ingredientsService || !contentId) {
      return null;
    }

    return (await this.ingredientsService.findOne({
      id: contentId,
      organizationId: organizationId,
    })) as unknown as Record<string, unknown> | null;
  }

  private async resolveBrandCredentials(params: {
    brandId: unknown;
    organizationId: string;
    platforms?: string[];
  }): Promise<Array<Record<string, unknown>>> {
    if (!this.credentialsService || !params.brandId) {
      return [];
    }

    const filter: Record<string, unknown> = {
      brandId: String(params.brandId),
      isConnected: true,
      isDeleted: false,
      organizationId: params.organizationId,
    };

    if (params.platforms && params.platforms.length > 0) {
      filter.platform = { in: params.platforms };
    }

    return (await this.credentialsService.find(filter)) as unknown as Array<
      Record<string, unknown>
    >;
  }

  private buildPublishPostCard(params: {
    availablePlatforms: string[];
    contentId: string;
    defaultCaption?: string;
    defaultPlatforms?: string[];
    description: string;
    scheduledAt?: string;
    sourceActionId: string;
    targets: AgentUiAction['targets'];
    title: string;
    visibility: PostVisibility;
  }): AgentUiAction {
    const selectedPlatforms =
      params.defaultPlatforms && params.defaultPlatforms.length > 0
        ? params.defaultPlatforms.filter((platform) =>
            params.availablePlatforms.includes(platform),
          )
        : params.availablePlatforms;

    return {
      contentId: params.contentId,
      data: {
        availablePlatforms: params.availablePlatforms,
      },
      description: params.description,
      id: params.sourceActionId,
      platforms: selectedPlatforms,
      requiresConfirmation: true,
      scheduledAt: params.scheduledAt,
      targets: params.targets,
      textContent: params.defaultCaption,
      title: params.title,
      type: 'publish_post_card' as const,
      visibility: params.visibility,
    };
  }

  async buildPublishCardResult(
    params: {
      caption?: string;
      contentId: string;
      platforms?: string[];
      scheduledAt?: string;
      visibility: PostVisibility;
    },
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const ingredient = await this.resolveIngredientForContent(
      params.contentId,
      ctx.organizationId,
    );

    if (!ingredient) {
      return {
        creditsUsed: 0,
        error: `Content ${params.contentId} not found`,
        success: false,
      };
    }

    await this.assertPublishingScope(
      ctx,
      readOptionalString(ingredient.brandId),
      'selected content',
    );

    const requestedPlatforms = params.platforms ?? [];
    const credentials = await this.resolveBrandCredentials({
      brandId: ingredient.brandId,
      organizationId: ctx.organizationId,
    });
    const availablePlatforms = Array.from(
      new Set(
        credentials
          .map((credential) => readDomainPlatform(credential.platform))
          .filter((platform): platform is CredentialPlatform =>
            Boolean(platform),
          ),
      ),
    );

    if (availablePlatforms.length === 0) {
      return {
        creditsUsed: 0,
        error: 'No connected social accounts are available for this content.',
        success: false,
      };
    }

    const defaultPlatforms =
      requestedPlatforms.length > 0
        ? availablePlatforms.filter((platform) =>
            requestedPlatforms.includes(platform),
          )
        : availablePlatforms;

    if (requestedPlatforms.length > 0 && defaultPlatforms.length === 0) {
      return {
        creditsUsed: 0,
        error:
          'None of the requested platforms have connected accounts for this content.',
        success: false,
      };
    }

    const media = resolvePublishValidationMedia(ingredient, params.contentId);
    const targets = buildAgentPublishTargetProposals({
      caption: params.caption,
      credentials,
      defaultPlatforms,
      media,
      publishMode: params.scheduledAt ? 'scheduled' : 'publish_now',
      visibility: params.visibility,
    });

    if (!this.cacheService) {
      throw new InternalServerErrorException(
        'Publish confirmation persistence is unavailable.',
      );
    }
    const sourceActionId = `publish-post-${randomUUID()}`;
    await persistPendingToolConfirmation(this.cacheService, {
      organizationId: ctx.organizationId,
      sourceActionId,
      threadId: ctx.threadId ?? '',
      toolName: 'create_post',
    });

    return {
      creditsUsed: 0,
      data: {
        availablePlatforms,
        contentId: params.contentId,
      },
      nextActions: [
        this.buildPublishPostCard({
          availablePlatforms,
          contentId: params.contentId,
          defaultCaption: params.caption,
          defaultPlatforms,
          description:
            params.scheduledAt != null
              ? 'Review the caption, schedule, and platforms before confirming.'
              : 'Review the caption and platforms before confirming.',
          scheduledAt: params.scheduledAt,
          sourceActionId,
          targets,
          title:
            params.scheduledAt != null
              ? 'Schedule selected content'
              : 'Publish selected content',
          visibility: params.visibility,
        }),
      ],
      success: true,
    };
  }
  private async assertPublishingScope(
    ctx: ToolExecutionContext,
    resourceBrandId: string | undefined,
    resourceLabel: string,
  ): Promise<void> {
    if (!ctx.validatedScope || !this.agentScopeContextService) {
      throw new Error(
        'Validated agent scope is required before publishing side effects.',
      );
    }

    await this.agentScopeContextService.assertConsequentialBoundary(
      ctx.validatedScope,
      'publish',
    );
    this.agentScopeContextService.assertResourceBrand(
      ctx.validatedScope,
      resourceBrandId,
      resourceLabel,
    );
  }
  async preparePost(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    if (isMcpActionOrigin()) return mcpDraftOnlyResult();
    const visibility = z
      .nativeEnum(PostVisibility)
      .safeParse(params.visibility ?? PostVisibility.PUBLIC);
    const contentId = readPublishContentId(params);
    if (!visibility.success || !contentId) {
      return {
        creditsUsed: 0,
        success: false,
        error:
          'Valid content and visibility are required to prepare publishing.',
      };
    }
    const { caption, platforms, requestedScheduledAt } =
      this.readPublishRequest(params);
    if (
      requestedScheduledAt &&
      Number.isNaN(new Date(requestedScheduledAt).getTime())
    ) {
      return {
        creditsUsed: 0,
        success: false,
        error: 'scheduledAt must be a valid date and time.',
      };
    }
    return this.buildPublishCardResult(
      {
        caption,
        contentId,
        platforms,
        scheduledAt: requestedScheduledAt,
        visibility: visibility.data,
      },
      ctx,
    );
  }

  async createPost(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const mcpBlock = blockMcpCreatePost(params);
    if (mcpBlock) return mcpBlock;
    const parsedVisibility = z
      .nativeEnum(PostVisibility)
      .safeParse(params.visibility ?? PostVisibility.PUBLIC);
    if (!parsedVisibility.success) {
      return {
        creditsUsed: 0,
        error: 'visibility must be public, private, or unlisted.',
        success: false,
      };
    }
    const visibility = parsedVisibility.data;
    const contentId = readPublishContentId(params);

    if (contentId) {
      const { caption, platforms, requestedScheduledAt, requestedTargets } =
        this.readPublishRequest(params);
      const scheduledDate = requestedScheduledAt
        ? new Date(requestedScheduledAt)
        : undefined;
      if (scheduledDate && Number.isNaN(scheduledDate.getTime())) {
        return {
          creditsUsed: 0,
          error: 'scheduledAt must be a valid date and time.',
          success: false,
        };
      }
      // Only the card-button resume sets `ctx.confirmationOrigin`. Model `confirmed` is stripped upstream.
      const isCardConfirmed = ctx.confirmationOrigin === 'thread-ui-action';
      if (!isCardConfirmed && !ctx.isProactive) {
        const policy = evaluateAgentAutoPublishPolicies({
          autonomyMode: ctx.autonomyMode,
          brandAutoPublishEnabled: false,
          channels: platforms,
        });
        if (!policy.isPermitted) {
          return this.buildPublishCardResult(
            {
              caption,
              contentId,
              platforms,
              scheduledAt: requestedScheduledAt,
              visibility,
            },
            ctx,
          );
        }
      }
      const scheduledAt = scheduledDate?.toISOString();

      const ingredient = await this.resolveIngredientForContent(
        contentId,
        ctx.organizationId,
      );

      if (!ingredient) {
        return {
          creditsUsed: 0,
          error: `Content ${contentId} not found`,
          success: false,
        };
      }

      const brandId = readOptionalString(ingredient.brandId);
      await this.assertPublishingScope(ctx, brandId, 'selected content');

      if (platforms.length === 0) {
        return {
          creditsUsed: 0,
          error: 'At least one platform is required to publish content.',
          success: false,
        };
      }

      const credentials = await this.resolveBrandCredentials({
        brandId,
        organizationId: ctx.organizationId,
        platforms,
      });
      const sourceActionId =
        readOptionalString(params.sourceActionId) ??
        (ctx.isProactive && ctx.runId
          ? `agent:${ctx.runId}:${contentId}`
          : undefined);
      if (!sourceActionId) {
        return {
          creditsUsed: 0,
          error:
            'sourceActionId is required to publish confirmed content safely.',
          success: false,
        };
      }
      if (isCardConfirmed) {
        const rejection = await this.rejectUnverifiedPublishCard(
          sourceActionId,
          ctx,
        );
        if (rejection) {
          return rejection;
        }
      }

      const postingSetId = readOptionalString(params.postingSetId);
      const timezone = readOptionalString(params.timezone);
      return this.publishConfirmedContent({
        caption,
        contentId,
        credentials,
        ctx,
        ingredient,
        platforms,
        ...(postingSetId ? { postingSetId } : {}),
        scheduledAt,
        sourceActionId,
        ...(requestedTargets.length > 0 ? { targets: requestedTargets } : {}),
        ...(timezone ? { timezone } : {}),
        visibility,
      });
    }

    await this.assertPublishingScope(
      ctx,
      ctx.validatedScope?.brandId,
      'post creation',
    );

    if (ctx.isProactive)
      return this.createProactiveTextPost(params, ctx, visibility);

    return createAgentTextDraft(this.postsService, params, ctx, visibility);
  }

  private createProactiveTextPost(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
    visibility: PostVisibility,
  ): Promise<AgentToolResult> {
    return createProactiveAgentTextPost(params, ctx, visibility, {
      batchGenerationService: this.batchGenerationService,
      postGroupsService: this.postGroupsService,
      readPublishRequest: (value) => this.readPublishRequest(value),
      resolveBrandCredentials: (value) => this.resolveBrandCredentials(value),
      resolvePublishPolicy: (value) => this.resolvePublishPolicy(value),
      writePublishAudit: (value) => this.writePublishAudit(value),
    });
  }

  async schedulePost(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    return scheduleAgentPost(params, ctx, {
      assertPublishingScope: (context, brandId, label) =>
        this.assertPublishingScope(context, brandId, label),
      autonomousPublishPolicyService: this.autonomousPublishPolicyService,
      logger: this.loggerService,
      owner: this.constructorName,
      postsService: this.postsService,
      scheduleCanonicalPost: (input) => this.scheduleCanonicalPost(input),
    });
  }

  /**
   * Repurpose an existing post into a draft for another channel (#2588).
   * Deterministic mode is free; agent mode bills the content-engine rewrite
   * here (delegated billing), so the catalog cost is a ceiling, not a flat fee.
   * Both modes only ever produce drafts — the review gate stays intact.
   */
  async repurposePost(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const postId = readOptionalString(params.postId);
    const platform = parsePlatform(readOptionalString(params.platform));
    const modeInput = readOptionalString(params.mode);
    const mode = Object.values(PostRepurposeMode).find(
      (candidate) => candidate === modeInput,
    );
    if (!postId || !platform || !mode) {
      return {
        creditsUsed: 0,
        error:
          'postId, platform, and mode (deterministic | agent) are required to repurpose a post.',
        success: false,
      };
    }

    try {
      const sourcePost = await this.postsService.findOne({
        id: postId,
        isDeleted: false,
        organizationId: ctx.organizationId,
      });
      if (!sourcePost) {
        return {
          creditsUsed: 0,
          error: `Post ${postId} not found`,
          success: false,
        };
      }
      await this.assertPublishingScope(
        ctx,
        readOptionalString(sourcePost.brandId),
        'source post',
      );

      const result = await this.postRepurposeService?.repurpose({
        credentialId: readOptionalString(params.credentialId),
        mode,
        organizationId: ctx.organizationId,
        platform,
        postId,
        userId: ctx.userId,
      });
      if (!result) {
        return {
          creditsUsed: 0,
          error: 'Post repurposing is not available on this deployment.',
          success: false,
        };
      }

      const creditsUsed =
        mode === PostRepurposeMode.AGENT ? BATCH_CAPTION_BASE_CREDITS : 0;
      if (creditsUsed > 0 && this.creditsUtilsService) {
        await this.creditsUtilsService.deductCreditsFromOrganization(
          ctx.organizationId,
          ctx.userId,
          creditsUsed,
          `Post repurpose (agent rewrite) ${postId}`,
          ActivitySource.SCRIPT,
        );
      }

      return {
        creditsUsed,
        data: {
          adjustments: result.adjustments,
          id: String(result.draft.id),
          mode,
          platform,
          ...(result.reviewBatchId && { reviewBatchId: result.reviewBatchId }),
          ...(result.reviewItemId && { reviewItemId: result.reviewItemId }),
          status: PostStatus.DRAFT,
        },
        isBillingDelegated: true,
        success: true,
      };
    } catch (error: unknown) {
      const detail = readRepurposeErrorDetail(error);
      if (!detail) {
        this.loggerService.error(
          `Post repurpose failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          this.constructorName,
        );
      }
      return {
        creditsUsed: 0,
        error:
          detail ??
          'Post repurposing failed. Verify the post, target channel, and credential, then retry.',
        success: false,
      };
    }
  }
}

/**
 * Client-safe detail from repurpose validation failures. Only 4xx
 * HttpException responses carry actionable catalog messages; 5xx and
 * non-HTTP errors are withheld so internal details never leak into
 * model-visible output.
 */
function readRepurposeErrorDetail(error: unknown): string | undefined {
  if (!(error instanceof HttpException) || error.getStatus() >= 500) {
    return undefined;
  }

  const response = error.getResponse();
  if (typeof response === 'string') {
    return response;
  }
  if (response && typeof response === 'object') {
    const detail = (response as { detail?: unknown; message?: unknown }).detail;
    if (typeof detail === 'string' && detail.length > 0) {
      return detail;
    }
    const message = (response as { message?: unknown }).message;
    if (typeof message === 'string' && message.length > 0) {
      return message;
    }
  }

  return error.message || undefined;
}
