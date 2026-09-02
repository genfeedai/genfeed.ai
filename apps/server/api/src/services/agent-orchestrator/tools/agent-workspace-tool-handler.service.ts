import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { PersonasService } from '@api/collections/personas/services/personas.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { postExecutionStateReadFilter } from '@api-types/contracts/scheduler.contract';
import { TargetExecutionState } from '@genfeedai/enums';
import type { AgentToolResult } from '@genfeedai/interfaces';
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
      ? String(params.ingredientId)
      : null;
    const type = String(params.type || 'image');
    const href = ingredientId
      ? `/g/${type}/${ingredientId}`
      : `/studio?type=${type}`;

    return {
      creditsUsed: 0,
      data: { href, ingredientId, type },
      nextActions: [
        {
          ctas: [{ href, label: 'Open in Studio' }],
          data: { href, ingredientId, type },
          id: `studio-handoff-${Date.now()}`,
          title: 'Continue in Studio',
          type: 'image_transform_card',
        },
      ],
      success: true,
    };
  }
}
