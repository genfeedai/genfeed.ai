import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { PersonasService } from '@api/collections/personas/services/personas.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { IngredientCategory, TargetExecutionState } from '@genfeedai/contracts';
import { postExecutionStateReadFilter } from '@genfeedai/contracts/api-types/contracts/scheduler.contract';
import { createLibraryAssetRoute } from '@genfeedai/contracts/constants';
import type { AgentToolResult } from '@genfeedai/contracts/interfaces';
import {
  serializeAgentBrand,
  serializeAgentBrands,
} from '@genfeedai/serializers';
import { Inject, Injectable } from '@nestjs/common';

type AgentBrandsServiceLike = {
  findAll: (
    query: Record<string, unknown>,
    options: Record<string, unknown>,
  ) => Promise<{ docs?: unknown[] }>;
  findOne: (query: Record<string, unknown>) => Promise<unknown>;
};

/**
 * Workspace read tools: credits, brands, posts list, studio handoff.
 * Extracted from AgentToolExecutorService per #519.
 */
@Injectable()
export class AgentWorkspaceToolHandler {
  constructor(
    private readonly creditsUtilsService: CreditsUtilsService,
    @Inject('AGENT_BRANDS_SERVICE')
    private readonly brandsService: AgentBrandsServiceLike,
    private readonly postsService: PostsService,
    private readonly personasService: PersonasService,
  ) {}

  async getCreditsBalance(ctx: ToolExecutionContext): Promise<AgentToolResult> {
    const balance =
      await this.creditsUtilsService.getOrganizationCreditsBalance(
        ctx.organizationId,
      );

    return {
      creditsUsed: 0,
      data: { balance },
      success: true,
    };
  }

  async listBrands(ctx: ToolExecutionContext): Promise<AgentToolResult> {
    const brands = await this.brandsService.findAll(
      {
        where: {
          isDeleted: false,
          organizationId: ctx.organizationId,
        },
      },
      {},
    );

    return {
      creditsUsed: 0,
      data: {
        brands: serializeAgentBrands(
          (brands.docs as Record<string, unknown>[] | undefined) ?? [],
        ),
      },
      success: true,
    };
  }

  async listCharacters(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const mentions = await this.personasService.listCharacterMentions({
      brandId: ctx.brandId,
      organizationId: ctx.organizationId,
      q: typeof params.q === 'string' ? params.q : undefined,
    });

    return {
      creditsUsed: 0,
      data: {
        characters: mentions.map((mention) => ({
          description: mention.label,
          handle: mention.handle,
          hasReferenceImage: mention.hasReferenceImage,
          label: mention.label,
        })),
      },
      success: true,
    };
  }

  async getCurrentBrand(ctx: ToolExecutionContext): Promise<AgentToolResult> {
    // Prefer explicit thread/run scope over the user's selected-brand flag.
    // Agent turns always carry brandId in context when the URL/thread has one;
    // relying only on isSelected fails when that flag is false or stale.
    const scopedBrandId = ctx.brandId || ctx.validatedScope?.brandId;

    const currentBrand = scopedBrandId
      ? await this.brandsService.findOne({
          id: scopedBrandId,
          isDeleted: false,
          organizationId: ctx.organizationId,
        })
      : await this.brandsService.findOne({
          isDeleted: false,
          isSelected: true,
          organizationId: ctx.organizationId,
          userId: ctx.userId,
        });

    if (!currentBrand) {
      return {
        creditsUsed: 0,
        error: scopedBrandId
          ? `Brand ${scopedBrandId} was not found for this organization.`
          : 'No brand is currently selected. Please select a brand first.',
        success: false,
      };
    }

    return {
      creditsUsed: 0,
      data: {
        currentBrand: serializeAgentBrand(
          currentBrand as unknown as Record<string, unknown>,
        ),
      },
      success: true,
    };
  }

  async listPosts(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const limit = (params.limit as number) || 10;
    const matchStage: Record<string, unknown> = {
      isDeleted: false,
      organizationId: ctx.organizationId,
    };

    const executionState = params.executionState;
    if (
      typeof executionState === 'string' &&
      Object.values(TargetExecutionState).includes(
        executionState as TargetExecutionState,
      )
    ) {
      Object.assign(
        matchStage,
        postExecutionStateReadFilter(executionState as TargetExecutionState),
      );
    }

    const posts = await this.postsService.findAll(
      { orderBy: { createdAt: -1 }, where: matchStage },
      { limit },
    );

    return {
      creditsUsed: 0,
      data: {
        count: posts.docs?.length ?? 0,
        posts:
          posts.docs?.map((p) => {
            const post = p as unknown as Record<string, unknown>;
            return {
              createdAt: post.createdAt,
              description: post.description,
              id: String(post.id),
              label: post.label,
              platform: post.platform,
              scheduledDate: post.scheduledDate,
              status: post.status,
            };
          }) ?? [],
      },
      success: true,
    };
  }

  async openStudioHandoff(
    params: Record<string, unknown>,
  ): Promise<AgentToolResult> {
    const ingredientId = params.ingredientId
      ? String(params.ingredientId).trim()
      : '';
    if (!ingredientId) {
      return {
        creditsUsed: 0,
        error:
          'open_studio_handoff requires ingredientId of an existing asset. To generate a new image or video, call prepare_generation. One-off generation stays in Agent.',
        success: false,
      };
    }

    const type = String(params.type || 'image');
    const href = createLibraryAssetRoute(
      studioHandoffCategory(type),
      ingredientId,
    );

    return {
      creditsUsed: 0,
      data: { href, ingredientId, type },
      nextActions: [
        {
          ctas: [{ href, label: 'View in Library' }],
          data: { href, ingredientId, type },
          editorType: type,
          id: `studio-handoff-${ingredientId}`,
          studioUrl: href,
          title: 'Open in Library',
          type: 'studio_handoff_card',
        },
      ],
      success: true,
    };
  }
}

function studioHandoffCategory(type: string): IngredientCategory {
  switch (type) {
    case 'avatar':
      return IngredientCategory.AVATAR;
    case 'music':
      return IngredientCategory.MUSIC;
    case 'video':
      return IngredientCategory.VIDEO;
    default:
      return IngredientCategory.IMAGE;
  }
}
