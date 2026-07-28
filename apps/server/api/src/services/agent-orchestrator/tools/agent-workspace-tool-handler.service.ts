import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
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
          organization: ctx.organizationId,
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

  async getCurrentBrand(ctx: ToolExecutionContext): Promise<AgentToolResult> {
    const currentBrand = await this.brandsService.findOne({
      isDeleted: false,
      isSelected: true,
      organization: ctx.organizationId,
      user: ctx.userId,
    } as never);

    if (!currentBrand) {
      return {
        creditsUsed: 0,
        error: 'No brand is currently selected. Please select a brand first.',
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
      organization: ctx.organizationId,
    };

    if (params.status) {
      matchStage.status = params.status;
    }

    const posts = await this.postsService.findAll(
      { orderBy: { createdAt: -1 }, where: matchStage },
      {},
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
