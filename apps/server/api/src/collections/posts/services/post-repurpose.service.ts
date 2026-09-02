import { ContentGeneratorService } from '@api/collections/content-intelligence/services/content-generator.service';
import { PostGroupPersistenceService } from '@api/collections/post-groups/services/post-group-persistence.service';
import type { PostDocument } from '@api/collections/posts/post.schema';
import {
  type PostCreateInput,
  PostsService,
} from '@api/collections/posts/services/posts.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { scopedWhere } from '@api/index';
import { BatchGenerationService } from '@api/services/batch-generation/batch-generation.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { PopulatePatterns } from '@api/shared/utils/populate/populate.util';
import {
  type ChannelTargetValidationResult,
  getChannelCapability,
  resolveChannelStatusIssue,
  resolveChannelTargetSettings,
  validateChannelTargetSettings,
} from '@api-types/contracts/channel-capabilities.contract';
import {
  type ChannelRepurposeAdjustment,
  type ChannelRepurposeMedia,
  getChannelTextPolicy,
  repurposePostContent,
} from '@api-types/contracts/channel-repurpose.contract';
import {
  ContentIntelligencePlatform,
  IngredientCategory,
  Platform,
  PostRepurposeMode,
  TargetExecutionState,
} from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadGatewayException,
  BadRequestException,
  Injectable,
} from '@nestjs/common';

export interface RepurposePostParams {
  credentialId?: string;
  mode: PostRepurposeMode;
  organizationId: string;
  platform: Platform;
  postId: string;
  userId: string;
}

export interface RepurposePostResult {
  adjustments: ChannelRepurposeAdjustment[];
  draft: PostDocument;
  reviewBatchId?: string;
  reviewItemId?: string;
}

type SourceIngredientRef = string | { category?: string; id?: string };

type SourceMediaItem = ChannelRepurposeMedia & { id: string };

/**
 * Channel media semantics of publishable ingredient categories. Categories
 * outside this map (audio, voice, text sources) never travel to a channel
 * target, so they are excluded from both validation and passthrough.
 */
const CHANNEL_MEDIA_BY_INGREDIENT_CATEGORY: Partial<
  Record<
    IngredientCategory,
    { isAnimated?: boolean; kind: ChannelRepurposeMedia['kind'] }
  >
> = {
  [IngredientCategory.AVATAR]: { kind: 'image' },
  [IngredientCategory.GIF]: { isAnimated: true, kind: 'image' },
  [IngredientCategory.IMAGE]: { kind: 'image' },
  [IngredientCategory.IMAGE_EDIT]: { kind: 'image' },
  [IngredientCategory.VIDEO]: { kind: 'video' },
  [IngredientCategory.VIDEO_EDIT]: { kind: 'video' },
};

/**
 * The content engine's platform vocabulary is narrower than the scheduler
 * catalog. Agent-mode repurposing is only offered where the engine can
 * actually write for the channel; everything else stays deterministic-only.
 */
const CONTENT_ENGINE_PLATFORMS: Partial<
  Record<Platform, ContentIntelligencePlatform>
> = {
  [Platform.INSTAGRAM]: ContentIntelligencePlatform.INSTAGRAM,
  [Platform.LINKEDIN]: ContentIntelligencePlatform.LINKEDIN,
  [Platform.TIKTOK]: ContentIntelligencePlatform.TIKTOK,
  [Platform.TWITTER]: ContentIntelligencePlatform.TWITTER,
};

/** Keeps every chunk under the prompt sanitizer's per-item truncation limit. */
const SOURCE_CONTEXT_CHUNK_SIZE = 280;

const REPURPOSE_WORKFLOW_NAME = 'post-repurpose';

@Injectable()
export class PostRepurposeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly postsService: PostsService,
    private readonly contentGeneratorService: ContentGeneratorService,
    private readonly batchGenerationService: BatchGenerationService,
    private readonly postGroupPersistenceService: PostGroupPersistenceService,
  ) {}

  async repurpose(params: RepurposePostParams): Promise<RepurposePostResult> {
    const source = await this.getSourcePostOrThrow(params);
    const credential = await this.resolveCredential(params);
    const media = this.toSourceMedia(source);

    if (params.mode === PostRepurposeMode.AGENT) {
      return this.repurposeWithAgent(params, source, credential?.id, media);
    }

    return this.repurposeDeterministically(
      params,
      source,
      credential?.id,
      media,
    );
  }

  private async repurposeDeterministically(
    params: RepurposePostParams,
    source: PostDocument,
    credentialId: string | undefined,
    media: SourceMediaItem[],
  ): Promise<RepurposePostResult> {
    const outcome = repurposePostContent({
      caption: source.description ?? '',
      media,
      targetPlatform: params.platform,
    });

    if (!outcome.ok) {
      throw new BadRequestException({
        detail: outcome.errors.map((issue) => issue.message).join(' '),
        title: 'Post cannot be repurposed to this channel',
      });
    }

    const order = await this.resolveGroupOrder(params.organizationId, source);
    const draft = await this.postsService.create({
      brandId: source.brandId,
      category: source.category as PostCreateInput['category'],
      credentialId: credentialId ?? null,
      description: outcome.caption,
      groupId: source.groupId ?? undefined,
      ingredients: media.map((item) => item.id),
      label: source.label || 'Untitled',
      order,
      organizationId: params.organizationId,
      originalPostId: source.id,
      platform: params.platform,
      targetExecutionState: TargetExecutionState.DRAFT,
      targetSettings: { ...resolveChannelTargetSettings(params.platform, {}) },
      targetValidationIssues: this.validationIssues(outcome.validation),
      targetValidationState: outcome.validation.validationState,
      timezone: source.timezone || 'UTC',
      userId: params.userId,
    });

    await this.recalculateGroup(params, source);

    this.logger.log('Post repurposed deterministically', {
      draftId: draft.id,
      platform: params.platform,
      sourcePostId: source.id,
    });

    return { adjustments: outcome.adjustments, draft };
  }

  private async repurposeWithAgent(
    params: RepurposePostParams,
    source: PostDocument,
    credentialId: string | undefined,
    media: SourceMediaItem[],
  ): Promise<RepurposePostResult> {
    this.assertRepurposableChannel(params.platform);

    const enginePlatform = CONTENT_ENGINE_PLATFORMS[params.platform];
    if (!enginePlatform) {
      const supported = Object.keys(CONTENT_ENGINE_PLATFORMS).join(', ');
      throw new BadRequestException({
        detail: `Agent repurposing currently covers ${supported}. Use deterministic mode for ${params.platform}.`,
        title: 'Channel not covered by the content engine',
      });
    }

    const generated = await this.contentGeneratorService.generateContent(
      params.organizationId,
      {
        additionalContext: this.buildSourceContext(source),
        brandId: source.brandId ?? undefined,
        platform: enginePlatform,
        topic: this.buildRewriteInstruction(params.platform, source),
        variationsCount: 1,
      },
    );

    const caption = generated[0]?.content?.trim();
    if (!caption) {
      throw new BadGatewayException(
        'The content engine returned no rewrite for this post.',
      );
    }

    const previewMedia = media[0];
    const previewMediaUrl = await this.resolveMediaUrl(
      params.organizationId,
      previewMedia?.id,
    );

    const batch = await this.batchGenerationService.createManualReviewBatch(
      {
        brandId: source.brandId,
        items: [
          {
            caption,
            format: 'post',
            ingredientId: previewMedia?.id,
            label: `Repurpose for ${params.platform}: ${source.label || 'Untitled'}`,
            mediaUrl: previewMediaUrl,
            platform: params.platform,
            prompt: this.buildRewriteInstruction(params.platform, source),
            sourceActionId: source.id,
            sourceWorkflowName: REPURPOSE_WORKFLOW_NAME,
          },
        ],
      },
      params.userId,
      params.organizationId,
    );

    const reviewItem = batch.items[0];
    if (!reviewItem?.postId) {
      throw new BadGatewayException(
        'The review batch was created without a draft post.',
      );
    }

    await this.linkAgentDraftLineage(
      params,
      source,
      credentialId,
      previewMedia,
      reviewItem.postId,
    );
    await this.recalculateGroup(params, source);

    const draft = await this.postsService.findOne({
      id: reviewItem.postId,
      isDeleted: false,
      organizationId: params.organizationId,
    });
    if (!draft) {
      throw new NotFoundException('Post', reviewItem.postId);
    }

    this.logger.log('Post repurposed via agent rewrite', {
      batchId: batch.id,
      draftId: reviewItem.postId,
      platform: params.platform,
      sourcePostId: source.id,
    });

    return {
      adjustments: [],
      draft,
      reviewBatchId: batch.id,
      reviewItemId: reviewItem.id,
    };
  }

  /**
   * Stamps the repurpose lineage and scheduler-target state onto the draft the
   * manual review batch created. A separate scoped write on purpose: the
   * review-batch DTO deliberately knows nothing about groups or variants, and
   * this mirrors how the batch itself links `reviewBatchId` after creation.
   */
  private async linkAgentDraftLineage(
    params: RepurposePostParams,
    source: PostDocument,
    credentialId: string | undefined,
    previewMedia: SourceMediaItem | undefined,
    draftPostId: string,
  ): Promise<void> {
    const validation = validateChannelTargetSettings({
      caption: undefined,
      media: previewMedia ? [previewMedia] : undefined,
      platform: params.platform,
      publishMode: 'draft',
      settings: { ...resolveChannelTargetSettings(params.platform, {}) },
    });

    const order = await this.resolveGroupOrder(params.organizationId, source);
    const updated = await this.prisma.post.updateMany({
      data: {
        credentialId: credentialId ?? null,
        groupId: source.groupId ?? null,
        order,
        originalPostId: source.id,
        targetExecutionState: TargetExecutionState.DRAFT,
        targetSettings: {
          ...resolveChannelTargetSettings(params.platform, {}),
        },
        targetValidationIssues: this.validationIssues(validation),
        targetValidationState: validation.validationState,
        timezone: source.timezone || 'UTC',
      },
      where: scopedWhere(params.organizationId, { id: draftPostId }),
    });

    if (updated.count !== 1) {
      throw new NotFoundException('Post', draftPostId);
    }
  }

  private async getSourcePostOrThrow(
    params: RepurposePostParams,
  ): Promise<PostDocument> {
    const source = await this.postsService.findOne(
      {
        id: params.postId,
        isDeleted: false,
        organizationId: params.organizationId,
      },
      [PopulatePatterns.ingredientsMinimal],
    );

    if (!source) {
      throw new NotFoundException('Post', params.postId);
    }

    return source;
  }

  private async resolveCredential(
    params: RepurposePostParams,
  ): Promise<{ id: string } | undefined> {
    if (!params.credentialId) {
      return undefined;
    }

    const credential = await this.prisma.credential.findFirst({
      select: { id: true, isConnected: true, platform: true },
      where: scopedWhere(params.organizationId, { id: params.credentialId }),
    });

    if (!credential || !credential.isConnected) {
      throw new BadRequestException({
        detail: `Credential ${params.credentialId} is not connected to this organization.`,
        title: 'Credential not available',
      });
    }

    if (
      String(credential.platform).toLowerCase() !==
      String(params.platform).toLowerCase()
    ) {
      throw new BadRequestException({
        detail: `Credential ${params.credentialId} is for ${String(credential.platform).toLowerCase()}, not ${params.platform}.`,
        title: 'Credential platform mismatch',
      });
    }

    return { id: credential.id };
  }

  private assertRepurposableChannel(platform: Platform): void {
    const capability = getChannelCapability(platform);
    if (!capability) {
      throw new BadRequestException({
        detail: `Platform "${platform}" has no scheduler channel capability and cannot receive repurposed posts.`,
        title: 'Channel not supported',
      });
    }

    const statusIssue = resolveChannelStatusIssue(capability);
    if (statusIssue?.severity === 'error') {
      throw new BadRequestException({
        detail: statusIssue.message,
        title: 'Channel not supported',
      });
    }
  }

  private buildRewriteInstruction(
    platform: Platform,
    source: PostDocument,
  ): string {
    const capability = getChannelCapability(platform);
    const policy = getChannelTextPolicy(platform);
    const constraints: string[] = [];

    if (capability) {
      constraints.push(`stay under ${capability.caption.maxLength} characters`);
    }
    if (policy.maxHashtags !== undefined) {
      constraints.push(`use at most ${policy.maxHashtags} hashtags`);
    }
    if (!policy.hasClickableLinks) {
      constraints.push('avoid links because captions are not clickable');
    }

    const sourcePlatform = source.platform
      ? `the existing ${source.platform} post`
      : 'the existing post';

    return `Rewrite ${sourcePlatform} from the provided source content for ${capability?.label ?? platform}. Preserve the message and facts without inventing claims; ${constraints.join('; ')}.`;
  }

  /**
   * Source caption chunks sized below the prompt sanitizer's per-item cap so
   * long posts survive the context handoff instead of being silently cut.
   */
  private buildSourceContext(source: PostDocument): string[] {
    const caption = (source.description ?? '').trim();
    if (!caption) {
      return [];
    }

    const codePoints = Array.from(caption);
    const chunks: string[] = [];
    for (
      let index = 0;
      index < codePoints.length;
      index += SOURCE_CONTEXT_CHUNK_SIZE
    ) {
      chunks.push(
        codePoints.slice(index, index + SOURCE_CONTEXT_CHUNK_SIZE).join(''),
      );
    }

    return [
      `Source post content (${chunks.length} part${chunks.length === 1 ? '' : 's'}):`,
      ...chunks,
    ];
  }

  private toSourceMedia(source: PostDocument): SourceMediaItem[] {
    const ingredients = (source.ingredients ??
      []) as unknown as SourceIngredientRef[];

    return ingredients.flatMap((ingredient) => {
      if (typeof ingredient === 'string' || !ingredient.id) {
        return [];
      }

      const category = Object.values(IngredientCategory).find(
        (candidate) => candidate === ingredient.category,
      );
      const mediaKind = category
        ? CHANNEL_MEDIA_BY_INGREDIENT_CATEGORY[category]
        : undefined;
      if (!mediaKind) {
        return [];
      }

      return [
        {
          id: ingredient.id,
          ...(mediaKind.isAnimated !== undefined && {
            isAnimated: mediaKind.isAnimated,
          }),
          kind: mediaKind.kind,
        },
      ];
    });
  }

  private async resolveMediaUrl(
    organizationId: string,
    ingredientId: string | undefined,
  ): Promise<string | undefined> {
    if (!ingredientId) {
      return undefined;
    }

    const row = await this.prisma.ingredient.findFirst({
      select: { cdnUrl: true },
      where: scopedWhere(organizationId, { id: ingredientId }),
    });

    return row?.cdnUrl ?? undefined;
  }

  private async resolveGroupOrder(
    organizationId: string,
    source: PostDocument,
  ): Promise<number> {
    if (!source.groupId) {
      return 0;
    }

    return this.prisma.post.count({
      where: scopedWhere(organizationId, {
        groupId: source.groupId,
        parentId: null,
      }),
    });
  }

  private async recalculateGroup(
    params: RepurposePostParams,
    source: PostDocument,
  ): Promise<void> {
    if (!source.groupId) {
      return;
    }

    // Release status is derived from target execution states rather than
    // stored, so re-hydrating the group is what refreshes it after the new
    // draft target lands. The hydrated group itself is not needed here.
    await this.postGroupPersistenceService.hydrateWithDerivedStatus(
      this.prisma,
      params.organizationId,
      source.groupId,
    );
  }

  private validationIssues(
    validation: ChannelTargetValidationResult,
  ): string[] {
    return [...validation.errors, ...validation.warnings].map(
      (issue) => issue.message,
    );
  }
}
