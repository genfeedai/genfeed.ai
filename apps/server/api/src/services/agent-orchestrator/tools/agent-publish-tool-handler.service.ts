import { createHash } from 'node:crypto';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { PostGroupsService } from '@api/collections/post-groups/services/post-groups.service';
import { CreatePostDto } from '@api/collections/posts/dto/create-post.dto';
import { PostRepurposeService } from '@api/collections/posts/services/post-repurpose.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
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
import {
  readAgentScheduleValidationError,
  SAFE_AGENT_SCHEDULE_ERROR,
} from '@api/services/agent-orchestrator/tools/agent-schedule-error.util';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { readOptionalString } from '@api/services/agent-orchestrator/tools/agent-tool-parameter-readers';
import { BATCH_CAPTION_BASE_CREDITS } from '@genfeedai/constants';
import {
  ActivitySource,
  CredentialPlatform,
  PostRepurposeMode,
  PostStatus,
  PostVisibility,
  parsePlatform,
  ReleaseStatus,
  TargetExecutionState,
} from '@genfeedai/enums';
import type {
  AgentPublishIdempotencyInput,
  AgentPublishTargetPayload,
  AgentToolResult,
  AgentUiAction,
  PublishConfirmedContentInput,
  ScheduleCanonicalPostInput,
} from '@genfeedai/interfaces';
import { AgentScopeContextService } from '@genfeedai/server';
import { LoggerService } from '@libs/logger/logger.service';
import {
  ConflictException,
  HttpException,
  Injectable,
  Optional,
} from '@nestjs/common';
import { z } from 'zod';

const STRICT_SCHEDULE_DATE_SCHEMA = z.string().datetime({ offset: true });

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
        agentRunId: input.ctx.runId,
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
      scheduledAt,
      sourceActionId,
      targets: requestedTargets,
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
    const resolvedTargets = this.resolveConfirmedTargets({
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

    const canonicalTargets = resolvedTargets.targets.map((target, order) =>
      toCanonicalChannelTarget({
        caption: targetsWithCaptions[order]?.caption,
        credentialId: target.credentialId,
        order,
        platform: target.platform,
        scheduledAt,
        settings: targetsWithCaptions[order]?.settings,
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
    const release = await this.postGroupsService.create(
      ctx.organizationId,
      ctx.userId,
      {
        baseContent,
        brandId: ingredient.brandId ?? undefined,
        idempotencyKey,
        media: [
          {
            assetId: contentId,
            ...(mediaKind ? { kind: mediaKind } : {}),
          },
        ],
        ...(scheduledAt
          ? {
              scheduledDate: scheduledAt,
              status: ReleaseStatus.SCHEDULED,
            }
          : { status: ReleaseStatus.DRAFT }),
        targets: canonicalTargets,
        timezone: 'UTC',
        title: baseContent.slice(0, 100),
      },
      idempotencyKey,
      {
        agentContextSource: ctx.validatedScope?.source,
        agentContextVersion: ctx.validatedScope?.contextVersion,
        agentRunId: ctx.runId,
        agentStrategyId: ctx.strategyId,
        agentThreadId: ctx.validatedScope?.threadId,
        source: 'agent',
        sourceActionId,
      },
    );
    const canonicalRelease = scheduledAt
      ? release
      : await this.postGroupsService.publishNow(
          ctx.organizationId,
          ctx.userId,
          release.id,
        );
    const groupId = canonicalRelease.id;
    const postIds = (canonicalRelease.targets ?? []).map((target) =>
      String(target.id),
    );
    const description = scheduledAt
      ? `Scheduled ${postIds.length} post${postIds.length === 1 ? '' : 's'} for ${createdPlatforms.join(', ')}.`
      : `Queued ${postIds.length} post${postIds.length === 1 ? '' : 's'} for publishing on ${createdPlatforms.join(', ')}.`;

    return {
      creditsUsed: 0,
      data: {
        contentId,
        createdPlatforms,
        missingPlatforms,
        postIds,
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
          id: `published-posts-${groupId}`,
          title: scheduledAt ? 'Posts scheduled' : 'Posts queued',
          type: 'content_preview_card' as const,
        },
      ],
      success: true,
    };
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
      this.readOptionalString(ingredient.label),
      this.readOptionalString(ingredient.description),
      this.readOptionalString(ingredient.assetLabel),
      this.readOptionalString(ingredient.generationPrompt),
    ];
    const resolved = candidates.find((candidate) => Boolean(candidate?.trim()));
    if (resolved) {
      return resolved.trim();
    }

    const category = this.readOptionalString(ingredient.category) ?? 'content';
    return `Selected ${category} asset`;
  }

  private resolveConfirmedTargets(params: {
    credentials: PublishConfirmedContentInput['credentials'];
    credentialsById: Map<
      string,
      PublishConfirmedContentInput['credentials'][number]
    >;
    requestedTargets: AgentPublishTargetPayload[] | undefined;
    visibility: PostVisibility;
  }):
    | {
        payloads: AgentPublishTargetPayload[];
        targets: Array<{
          credentialId: string;
          platform: CredentialPlatform;
        }>;
      }
    | { error: AgentToolResult } {
    if (params.requestedTargets && params.requestedTargets.length > 0) {
      const payloads: AgentPublishTargetPayload[] = [];
      const targets: Array<{
        credentialId: string;
        platform: CredentialPlatform;
      }> = [];

      for (const requested of params.requestedTargets) {
        const credential = params.credentialsById.get(requested.credentialId);
        const platform =
          readDomainPlatform(credential?.platform) ??
          readDomainPlatform(requested.platform);
        if (!credential || !platform) {
          return {
            error: {
              creditsUsed: 0,
              error: `Missing connected accounts for: ${requested.platform}.`,
              success: false,
            },
          };
        }

        payloads.push({
          ...requested,
          platform,
          visibility: requested.visibility ?? params.visibility,
        });
        targets.push({
          credentialId: requested.credentialId,
          platform,
        });
      }

      return { payloads, targets };
    }

    const payloads: AgentPublishTargetPayload[] = [];
    const targets: Array<{
      credentialId: string;
      platform: CredentialPlatform;
    }> = [];

    for (const credential of params.credentials) {
      const credentialId = readCredentialId(credential.id);
      const platform = readDomainPlatform(credential.platform);
      if (!credentialId || !platform) {
        continue;
      }

      payloads.push({
        credentialId,
        platform,
        visibility: params.visibility,
      });
      targets.push({ credentialId, platform });
    }

    return { payloads, targets };
  }

  private readOptionalString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0
      ? value.trim()
      : undefined;
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
      id: `publish-post-${Date.now()}`,
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
  async createPost(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
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
    const contentId =
      typeof params.contentId === 'string' && params.contentId.trim().length > 0
        ? params.contentId.trim()
        : typeof params.ingredientId === 'string' &&
            params.ingredientId.trim().length > 0
          ? params.ingredientId.trim()
          : undefined;

    if (contentId) {
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
      if (params.confirmed !== true) {
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
      const sourceActionId = readOptionalString(params.sourceActionId);
      if (!sourceActionId) {
        return {
          creditsUsed: 0,
          error:
            'sourceActionId is required to publish confirmed content safely.',
          success: false,
        };
      }

      return this.publishConfirmedContent({
        caption,
        contentId,
        credentials,
        ctx,
        ingredient,
        platforms,
        scheduledAt,
        sourceActionId,
        ...(requestedTargets.length > 0 ? { targets: requestedTargets } : {}),
        visibility,
      });
    }

    await this.assertPublishingScope(
      ctx,
      ctx.validatedScope?.brandId,
      'post creation',
    );

    const post = await this.postsService.create({
      ...(ctx.runId ? { agentRunId: ctx.runId } : {}),
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

  async schedulePost(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
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
      const post = await this.postsService.findOne({
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

      await this.assertPublishingScope(
        ctx,
        readOptionalString(post.brandId),
        'scheduled post',
      );

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

      return await this.scheduleCanonicalPost({
        ctx,
        groupId,
        postId,
        scheduledAt: scheduledDate.toISOString(),
      });
    } catch (error: unknown) {
      const validationError = readAgentScheduleValidationError(error);
      if (!validationError) {
        this.loggerService.error(
          `Canonical schedule failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          this.constructorName,
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
