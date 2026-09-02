import { AgentMediaAssetGenerationService } from '@api/services/agent-orchestrator/tools/agent-media-asset-generation.service';
import { AgentMediaBatchGenerationService } from '@api/services/agent-orchestrator/tools/agent-media-batch-generation.service';
import { AgentMediaTextGenerationService } from '@api/services/agent-orchestrator/tools/agent-media-text-generation.service';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
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

  async generateImage(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    return this.assetGeneration.generateImage(params, ctx);
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

  async generateVideo(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    return this.assetGeneration.generateVideo(params, ctx);
  }

  async generateMusic(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    return this.assetGeneration.generateMusic(params, ctx);
  }

  async generateVoice(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    return this.assetGeneration.generateVoice(params, ctx);
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
