import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { GenerationHarnessSettingsService } from '@api/services/harness/generation-harness-settings.service';
import type {
  AgentToolResult,
  UpdateGenerationHarnessSettings,
} from '@genfeedai/contracts/interfaces';
import { BadRequestException, Injectable } from '@nestjs/common';

@Injectable()
export class AgentGenerationSettingsToolHandler {
  constructor(private readonly settings: GenerationHarnessSettingsService) {}

  async get(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const brandId = this.brandId(params, ctx);
    return {
      success: true,
      creditsUsed: 0,
      data: { ...(await this.settings.get(ctx.organizationId, brandId)) },
    };
  }

  async set(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    if (
      (params.scope !== 'organization' && params.scope !== 'brand') ||
      (params.isEnabled !== null && typeof params.isEnabled !== 'boolean')
    ) {
      throw new BadRequestException(
        'scope and a boolean or null isEnabled are required',
      );
    }
    const input: UpdateGenerationHarnessSettings = {
      scope: params.scope,
      isEnabled: params.isEnabled,
      brandId: this.brandId(params, ctx),
    };
    return {
      success: true,
      creditsUsed: 0,
      data: { ...(await this.settings.set(ctx.organizationId, input)) },
    };
  }

  private brandId(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): string | undefined {
    if (
      params.brandId !== undefined &&
      (typeof params.brandId !== 'string' || !params.brandId.trim())
    )
      throw new BadRequestException('brandId must be a nonempty string');
    return typeof params.brandId === 'string' ? params.brandId : ctx.brandId;
  }
}
