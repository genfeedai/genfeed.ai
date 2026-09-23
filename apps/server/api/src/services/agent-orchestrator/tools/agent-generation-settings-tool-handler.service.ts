import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { GenerationHarnessSettingsService } from '@api/services/harness/generation-harness-settings.service';
import { MediaPromptEnhancementService } from '@api/services/harness/media-prompt-enhancement.service';
import type {
  AgentToolResult,
  UpdateGenerationHarnessSettings,
} from '@genfeedai/contracts/interfaces';
import { BadRequestException, Injectable } from '@nestjs/common';

@Injectable()
export class AgentGenerationSettingsToolHandler {
  constructor(
    private readonly settings: GenerationHarnessSettingsService,
    private readonly enhancement: MediaPromptEnhancementService,
  ) {}

  handles(toolName: string): boolean {
    return (
      toolName === 'get_generation_settings' ||
      toolName === 'set_generation_settings' ||
      toolName === 'enhance_prompt'
    );
  }

  async execute(
    toolName: string,
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    switch (toolName) {
      case 'enhance_prompt':
        return this.enhance(params, ctx);
      case 'set_generation_settings':
        return this.set(params, ctx);
      case 'get_generation_settings':
        return this.get(params, ctx);
      default:
        throw new BadRequestException(
          `Unknown generation settings tool: ${toolName}`,
        );
    }
  }

  async enhance(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const brandId = this.brandId(params, ctx);
    if (!brandId || typeof params.prompt !== 'string' || !params.prompt.trim())
      throw new BadRequestException(
        'brandId and a nonempty prompt are required',
      );
    if (params.contentType !== 'image' && params.contentType !== 'video')
      throw new BadRequestException('contentType must be image or video');
    if (params.harness !== undefined && typeof params.harness !== 'boolean')
      throw new BadRequestException('harness must be a boolean');
    const receipt = await this.enhancement.enhance({
      organizationId: ctx.organizationId,
      brandId,
      prompt: params.prompt,
      contentType: params.contentType,
      model: typeof params.model === 'string' ? params.model : undefined,
      harness: params.harness,
    });
    return {
      success: true,
      creditsUsed: receipt.status === 'applied' ? 1 : 0,
      isBillingDelegated: receipt.status === 'skipped',
      data: { generationHarness: receipt, prompt: receipt.enhancedPrompt },
    };
  }

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
