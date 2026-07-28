import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
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
 * Workspace read tools: credits balance, list brands, current brand.
 * Extracted from AgentToolExecutorService per #519.
 */
@Injectable()
export class AgentWorkspaceToolHandler {
  constructor(
    private readonly creditsUtilsService: CreditsUtilsService,
    @Inject('AGENT_BRANDS_SERVICE')
    private readonly brandsService: AgentBrandsServiceLike,
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
}
