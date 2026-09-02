import { ImagesService } from '@api/collections/images/services/images.service';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { VoteEntity } from '@api/collections/votes/entities/vote.entity';
import { VotesService } from '@api/collections/votes/services/votes.service';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { ContentQualityScorerService } from '@api/services/content-quality/content-quality-scorer.service';
import { SeoScorerService } from '@api/services/seo/seo-scorer.service';
import {
  IngredientCategory,
  IngredientStatus,
  VoteEntityModel,
} from '@genfeedai/contracts';
import type {
  AgentIngredientItem,
  AgentToolResult,
  AgentUiAction,
} from '@genfeedai/contracts/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, Optional } from '@nestjs/common';

/**
 * Content quality, SEO, and ingredient voting tools.
 * Extracted from AgentToolExecutorService per #519.
 */
@Injectable()
export class AgentQualityToolHandler {
  constructor(
    private readonly loggerService: LoggerService,
    @Optional()
    private readonly contentQualityScorerService?: ContentQualityScorerService,
    @Optional()
    private readonly seoScorerService?: SeoScorerService,
    @Optional()
    private readonly ingredientsService?: IngredientsService,
    @Optional()
    private readonly votesService?: VotesService,
    @Optional()
    private readonly imagesService?: ImagesService,
  ) {}

  async rateContent(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    if (!this.contentQualityScorerService) {
      return {
        creditsUsed: 0,
        error: 'ContentQualityScorerService not available',
        success: false,
      };
    }

    const contentId = params.contentId ? String(params.contentId) : undefined;
    const contentType = params.contentType
      ? String(params.contentType)
      : 'image';
    const context = params.context ? String(params.context) : undefined;

    if (!contentId) {
      return {
        creditsUsed: 0,
        error: 'contentId is required',
        success: false,
      };
    }

    try {
      const result = await this.contentQualityScorerService.scoreContent(
        contentId,
        contentType,
        context,
        ctx.organizationId,
      );

      return {
        creditsUsed: 0,
        data: {
          ...(result as unknown as Record<string, unknown>),
          message: `Quality score: ${result.score}/10 (${result.category}). ${result.suggestions[0] ?? ''}`,
        },
        success: true,
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      this.loggerService.error(`AgentQualityToolHandler RATE_CONTENT failed`, {
        contentId,
        error: errorMessage,
      });

      return {
        creditsUsed: 0,
        error: `Rate content failed: ${errorMessage}`,
        success: false,
      };
    }
  }

  // ──────────────────────────────────────────────
  // SEO SCORING
  // ──────────────────────────────────────────────

  async scoreSeo(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    if (!this.seoScorerService) {
      return {
        creditsUsed: 0,
        error: 'SeoScorerService not available',
        success: false,
      };
    }

    const contentId = params.contentId ? String(params.contentId) : undefined;
    const contentType =
      String(params.contentType ?? 'article') === 'post' ? 'post' : 'article';
    const targetKeyword = params.targetKeyword
      ? String(params.targetKeyword)
      : undefined;

    if (!contentId) {
      return {
        creditsUsed: 0,
        error: 'contentId is required',
        success: false,
      };
    }

    try {
      const result =
        contentType === 'post'
          ? await this.seoScorerService.scorePost(
              contentId,
              ctx.organizationId,
              targetKeyword,
            )
          : await this.seoScorerService.scoreArticle(
              contentId,
              ctx.organizationId,
              targetKeyword,
            );

      return {
        creditsUsed: 0,
        data: {
          breakdown: result.breakdown,
          message: `SEO score: ${result.score}/100 (${result.rating}). ${result.suggestions[0] ?? ''}`,
          rating: result.rating,
          score: result.score,
          suggestions: result.suggestions,
        },
        success: true,
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      this.loggerService.error(`AgentQualityToolHandler SCORE_SEO failed`, {
        contentId,
        error: errorMessage,
      });

      return {
        creditsUsed: 0,
        error: `Score SEO failed: ${errorMessage}`,
        success: false,
      };
    }
  }

  // ──────────────────────────────────────────────
  // INGREDIENT VOTING & REPLICATION TOOLS
  // ──────────────────────────────────────────────

  async rateIngredient(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    try {
      const ingredientId = String(params.ingredientId || '');

      if (!ingredientId) {
        return {
          creditsUsed: 0,
          error: 'Valid ingredientId is required',
          success: false,
        };
      }

      if (!this.votesService) {
        return {
          creditsUsed: 0,
          error: 'VotesService not available',
          success: false,
        };
      }

      // Toggle: if an active vote exists, remove it; otherwise create one
      const existing = await this.votesService.findOne({
        entityId: ingredientId,
        userId: ctx.userId,
      });

      if (existing) {
        const existingVoteId = String(existing.id);
        await this.votesService.patchAll(
          { id: existingVoteId },
          { isDeleted: true },
        );

        return {
          creditsUsed: 0,
          data: {
            action: 'removed',
            ingredientId,
          },
          success: true,
        };
      }

      const vote = await this.votesService.create(
        new VoteEntity({
          entity: ingredientId,
          entityModel: VoteEntityModel.INGREDIENT,
          userId: ctx.userId,
        }) as unknown as Parameters<VotesService['create']>[0],
      );
      return {
        creditsUsed: 0,
        data: {
          action: 'added',
          ingredientId,
          voteId: String(vote.id),
        },
        success: true,
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.loggerService.error(
        `AgentQualityToolHandler RATE_INGREDIENT failed`,
        { error: errorMessage },
      );
      return {
        creditsUsed: 0,
        error: `Rate ingredient failed: ${errorMessage}`,
        success: false,
      };
    }
  }

  async getTopIngredients(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    try {
      const brandId = params.brandId ? String(params.brandId) : undefined;
      const limit = Number(params.limit) || 10;
      const category = params.category ? String(params.category) : undefined;

      if (!this.ingredientsService) {
        return {
          creditsUsed: 0,
          error: 'IngredientsService not available',
          success: false,
        };
      }

      const result = await this.ingredientsService.findTopByVotes({
        brandId,
        category,
        limit,
        organizationId: ctx.organizationId,
      });

      const ingredients = result.docs.map((doc) => ({
        id: String(doc.id),
        category: (doc as unknown as Record<string, unknown>).category,
        status: (doc as unknown as Record<string, unknown>).status,
        totalVotes: (doc as unknown as Record<string, unknown>).totalVotes ?? 0,
      }));

      return {
        creditsUsed: 0,
        data: {
          ingredients,
          total: result.totalDocs,
        },
        success: true,
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.loggerService.error(
        `AgentQualityToolHandler GET_TOP_INGREDIENTS failed`,
        { error: errorMessage },
      );
      return {
        creditsUsed: 0,
        error: `Get top ingredients failed: ${errorMessage}`,
        success: false,
      };
    }
  }

  async replicateTopIngredient(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    try {
      const ingredientId = String(params.ingredientId || '');
      const variations = Number(params.variations) || 3;

      if (!ingredientId) {
        return {
          creditsUsed: 0,
          error: 'Valid ingredientId is required',
          success: false,
        };
      }

      if (!this.ingredientsService) {
        return {
          creditsUsed: 0,
          error: 'IngredientsService not available',
          success: false,
        };
      }

      const ingredient = await this.ingredientsService.findOne({
        id: ingredientId,
        organizationId: ctx.organizationId,
      });

      if (!ingredient) {
        return {
          creditsUsed: 0,
          error: `Ingredient ${ingredientId} not found`,
          success: false,
        };
      }

      const ingredientData = ingredient as unknown as Record<string, unknown>;
      const category = String(ingredientData.category || '');

      // Return action card with ingredient metadata for the agent to use
      // with existing generation tools (generate_image / generate_video)
      return {
        creditsUsed: 0,
        data: {
          category,
          ingredientId,
          message: `Ready to replicate ingredient. Use generate_image or generate_video with the same parameters to create ${variations} variation(s).`,
          sourceMetadata: {
            brand: ingredientData.brandId
              ? String(ingredientData.brandId)
              : undefined,
            category,
            prompt: ingredientData.prompt
              ? String(ingredientData.prompt)
              : undefined,
            status: ingredientData.status,
          },
          suggestedVariations: variations,
        },
        nextActions: [
          {
            label: `Generate ${variations} variation(s)`,
            type: 'generate',
          } as unknown as AgentUiAction,
        ],
        success: true,
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.loggerService.error(
        `AgentQualityToolHandler REPLICATE_TOP_INGREDIENT failed`,
        { error: errorMessage },
      );
      return {
        creditsUsed: 0,
        error: `Replicate ingredient failed: ${errorMessage}`,
        success: false,
      };
    }
  }

  async selectIngredient(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const PICKER_LIMIT = 9;
    const mediaType = (params.mediaType as string | undefined) ?? 'all';

    const categoryFilter: string[] = [];
    if (mediaType === 'image' || mediaType === 'all') {
      categoryFilter.push(IngredientCategory.IMAGE);
    }
    if (mediaType === 'video' || mediaType === 'all') {
      categoryFilter.push(IngredientCategory.VIDEO);
    }

    const baseFilters: Record<string, unknown> = {
      category: { in: categoryFilter },
      status: IngredientStatus.GENERATED,
    };

    if (params.brandId) {
      baseFilters.brand = params.brandId as string;
    }

    type AssetDoc = {
      id: unknown;
      category: string;
      cdnUrl?: string;
      metadata?: { label?: string } | null;
    };

    let assets: AssetDoc[] = [];

    if (this.imagesService) {
      const docs = await this.imagesService.findAllByOrganization(
        ctx.organizationId,
        baseFilters,
        { createdAt: -1 },
        [{ path: 'metadata', select: ['id', 'label'] }],
      );

      assets = (docs as AssetDoc[]).slice(0, PICKER_LIMIT);
    }

    if (assets.length === 0) {
      return {
        creditsUsed: 0,
        data: {
          count: 0,
          message: 'No media assets found in your library.',
        },
        success: true,
      };
    }

    const ingredients: AgentIngredientItem[] = assets.map((asset) => {
      const id = String(asset.id);
      const url = asset.cdnUrl ?? '';
      const isVideo = asset.category === IngredientCategory.VIDEO;
      const title =
        (asset.metadata as { label?: string } | null)?.label ?? undefined;

      return {
        id,
        thumbnailUrl: url,
        title,
        type: isVideo ? ('video' as const) : ('image' as const),
        url,
      };
    });

    return {
      creditsUsed: 0,
      data: {
        count: ingredients.length,
        message: `Found ${ingredients.length} asset${ingredients.length === 1 ? '' : 's'} in your library.`,
      },
      nextActions: [
        {
          description:
            'Select an asset from your library to use as an ingredient',
          id: `ingredient-picker-${Date.now()}`,
          ingredients,
          title: 'Pick from your library',
          type: 'ingredient_picker_card' as const,
        },
      ],
      success: true,
    };
  }

  suggestIngredientAlternatives(
    params: Record<string, unknown>,
  ): AgentToolResult {
    const generationType = params.generationType as 'image' | 'video';
    const alternatives = params.alternatives as
      | { label: string; prompt: string }[]
      | undefined;

    if (!generationType || !alternatives?.length) {
      return {
        creditsUsed: 0,
        error: 'generationType and alternatives are required',
        success: false,
      };
    }

    return {
      creditsUsed: 0,
      nextActions: [
        {
          alternatives: alternatives.map((a) => ({ ...a, generationType })),
          id: `ingredient-alts-${Date.now()}`,
          title: 'Alternative Prompts',
          type: 'ingredient_alternatives_card' as const,
        },
      ],
      success: true,
    };
  }
}
