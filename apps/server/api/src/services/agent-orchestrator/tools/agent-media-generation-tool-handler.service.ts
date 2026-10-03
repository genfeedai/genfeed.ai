import { AgentMediaAssetGenerationService } from '@api/services/agent-orchestrator/tools/agent-media-asset-generation.service';
import { AgentMediaBatchGenerationService } from '@api/services/agent-orchestrator/tools/agent-media-batch-generation.service';
import { AgentMediaTextGenerationService } from '@api/services/agent-orchestrator/tools/agent-media-text-generation.service';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import {
  findInapplicableMediaGenerationParameters,
  isMediaGenerationType,
  MEDIA_GENERATION_TYPES,
} from '@genfeedai/actions';
import type { AgentToolResult } from '@genfeedai/contracts/interfaces';
import { Injectable } from '@nestjs/common';

/**
 * Stable media-tool facade. Each tool family has one bounded runtime owner so
 * provider payloads, text resources, and batch accounting evolve separately.
 */
@Injectable()
export class AgentMediaGenerationToolHandler {
  constructor(
    private readonly textGeneration: AgentMediaTextGenerationService,
    private readonly assetGeneration: AgentMediaAssetGenerationService,
    private readonly batchGeneration: AgentMediaBatchGenerationService,
  ) {}

  async aiAction(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    return this.textGeneration.aiAction(params, ctx);
  }

  async generateContent(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    return this.textGeneration.generateContent(params, ctx);
  }

  /**
   * `generate` routes by `type` to the per-kind runtime. Voice and music
   * runtimes read the spoken or described text from `text`, so `prompt` is
   * mapped there; every other accepted field passes through unchanged.
   */
  async generate(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const { type, ...rest } = params;
    if (!isMediaGenerationType(type)) {
      return {
        creditsUsed: 0,
        error: `type must be one of: ${MEDIA_GENERATION_TYPES.join(', ')}`,
        success: false,
      };
    }
    const inapplicable = findInapplicableMediaGenerationParameters(
      type,
      params,
    );
    if (inapplicable.length > 0) {
      return {
        creditsUsed: 0,
        error: `${inapplicable.join(', ')} ${inapplicable.length === 1 ? 'does' : 'do'} not apply to type ${type}`,
        success: false,
      };
    }
    const prompt = typeof rest.prompt === 'string' ? rest.prompt.trim() : '';
    if (!prompt) {
      return { creditsUsed: 0, error: 'prompt is required', success: false };
    }

    switch (type) {
      case 'image':
        return this.assetGeneration.generateImage(rest, ctx);
      case 'video':
        return this.assetGeneration.generateVideo(rest, ctx);
      case 'voice': {
        const { prompt: _prompt, ...voice } = rest;
        return this.assetGeneration.generateVoice(
          { ...voice, text: prompt },
          ctx,
        );
      }
      case 'music': {
        const { prompt: _prompt, ...music } = rest;
        return this.assetGeneration.generateMusic(
          { ...music, text: prompt },
          ctx,
        );
      }
    }
  }

  async editImage(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    return this.assetGeneration.editImage(params, ctx);
  }

  async reframeImage(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    return this.assetGeneration.reframeImage(params, ctx);
  }

  async upscaleImage(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    return this.assetGeneration.upscaleImage(params, ctx);
  }

  async generateContentBatch(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    return this.batchGeneration.generateContentBatch(params, ctx);
  }

  async generateAsIdentity(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    return this.assetGeneration.generateAsIdentity(params, ctx);
  }
}
