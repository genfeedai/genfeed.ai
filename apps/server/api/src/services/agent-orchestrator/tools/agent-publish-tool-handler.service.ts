import { createHash } from 'node:crypto';
import { PostGroupsService } from '@api/collections/post-groups/services/post-groups.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import {
  readAgentScheduleValidationError,
  SAFE_AGENT_SCHEDULE_ERROR,
} from '@api/services/agent-orchestrator/tools/agent-schedule-error.util';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { readOptionalString } from '@api/services/agent-orchestrator/tools/agent-tool-parameter-readers';
import { resolveRelationId } from '@api/shared/utils/relation-id/relation-id.util';
import {
  CredentialPlatform,
  IngredientCategory,
  PostStatus,
  ReleaseStatus,
  TargetExecutionState,
} from '@genfeedai/enums';
import type {
  AgentPublishIdempotencyInput,
  AgentToolResult,
  AgentUiAction,
  PublishConfirmedContentInput,
  ScheduleCanonicalPostInput,
} from '@genfeedai/interfaces';
import { AgentScopeContextService } from '@genfeedai/server';
import { LoggerService } from '@libs/logger/logger.service';
import { ConflictException, Injectable, Optional } from '@nestjs/common';
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
    } = input;

    if (credentials.length === 0) {
      return {
        creditsUsed: 0,
        error:
          'No connected social accounts are available for the selected platforms.',
        success: false,
      };
    }

    const createdPlatforms = Array.from(
      new Set(
        credentials
          .map((credential) => String(credential.platform || '').toLowerCase())
          .filter((platform) => platform.length > 0),
      ),
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
    const idempotencyKey = this.buildIdempotencyKey({
      baseContent,
      contentId,
      organizationId: ctx.organizationId,
      platforms,
      scheduledAt,
      sourceActionId,
      threadId: ctx.threadId,
      userId: ctx.userId,
    });
    const mediaKind = this.resolveReleaseMediaKind(ingredient.category);
    const release = await this.postGroupsService.create(
      ctx.organizationId,
      ctx.userId,
      {
        baseContent,
        brandId: String(ingredient.brand),
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
        targets: credentials.map((credential, order) => ({
          credentialId: String(credential.id),
          order,
          platform: credential.platform as CredentialPlatform,
          ...(scheduledAt ? { scheduledDate: scheduledAt } : {}),
        })),
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

  private resolveReleaseMediaKind(category: unknown): string | undefined {
    if (
      category === IngredientCategory.IMAGE ||
      category === IngredientCategory.IMAGE_EDIT ||
      category === IngredientCategory.GIF
    ) {
      return 'image';
    }
    if (
      category === IngredientCategory.VIDEO ||
      category === IngredientCategory.VIDEO_EDIT
    ) {
      return 'video';
    }
    return undefined;
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
      _id: contentId,
      isDeleted: false,
      organization: organizationId,
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
      brand: String(params.brandId),
      isConnected: true,
      isDeleted: false,
      organization: params.organizationId,
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
    title: string;
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
      textContent: params.defaultCaption,
      title: params.title,
      type: 'publish_post_card' as const,
    };
  }

  async buildPublishCardResult(
    params: {
      caption?: string;
      contentId: string;
      platforms?: string[];
      scheduledAt?: string;
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
      brandId: resolveRelationId(ingredient.brandId, ingredient.brand),
      organizationId: ctx.organizationId,
    });
    const availablePlatforms = Array.from(
      new Set(
        credentials
          .map((credential) => String(credential.platform || '').toLowerCase())
          .filter((platform) => platform.length > 0),
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
          title:
            params.scheduledAt != null
              ? 'Schedule selected content'
              : 'Publish selected content',
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
      const platforms = this.normalizePlatforms(
        Array.isArray(params.platforms)
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

      const brandId = resolveRelationId(ingredient.brandId, ingredient.brand);
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
      brand: ctx.validatedScope?.brandId,
      description: params.content as string,
      label: ((params.content as string) || '').substring(0, 100),
      organization: ctx.organizationId,
      source: 'agent',
      status: PostStatus.DRAFT,
      user: ctx.userId,
    } as never);

    return {
      creditsUsed: 0,
      data: {
        id: String(post.id),
        status: PostStatus.DRAFT,
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
        _id: postId,
        isDeleted: false,
        organization: ctx.organizationId,
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
        readOptionalString(post.brandId) ?? readOptionalString(post.brand),
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
}
