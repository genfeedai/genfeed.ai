import { createHash } from 'node:crypto';
import { PostGroupsService } from '@api/collections/post-groups/services/post-groups.service';
import { UsersService } from '@api/collections/users/services/users.service';
import {
  CredentialPlatform,
  IngredientCategory,
  ReleaseStatus,
} from '@genfeedai/enums';
import type {
  AgentPublishIdempotencyInput,
  AgentToolResult,
  PublishConfirmedContentInput,
} from '@genfeedai/interfaces';
import { Injectable } from '@nestjs/common';

/**
 * Routes confirmed agent publishing through the canonical release scheduler.
 * Extracted from AgentToolExecutorService per #519/#520 so the executor remains
 * an orchestration boundary rather than growing another publishing subsystem.
 */
@Injectable()
export class AgentPublishToolHandler {
  constructor(
    private readonly postGroupsService: PostGroupsService,
    private readonly usersService: UsersService,
  ) {}

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

    const canonicalUserId = await this.usersService.findMongoIdByAuthProviderId(
      ctx.userId,
    );
    if (!canonicalUserId) {
      return {
        creditsUsed: 0,
        error: 'The publishing user could not be resolved.',
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
      userId: canonicalUserId,
    });
    const mediaKind = this.resolveReleaseMediaKind(ingredient.category);
    const release = await this.postGroupsService.create(
      ctx.organizationId,
      canonicalUserId,
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
          canonicalUserId,
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
}
