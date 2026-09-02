import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { AgentSpawnService } from '@api/services/agent-spawn/agent-spawn.service';
import { AgentType } from '@genfeedai/contracts';
import type { AgentToolResult } from '@genfeedai/contracts/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, Optional } from '@nestjs/common';

/**
 * Sub-agent spawn and asset request tools.
 * Extracted from AgentToolExecutorService per #519.
 */
@Injectable()
export class AgentSpawnToolHandler {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly loggerService: LoggerService,
    @Optional()
    private readonly agentSpawnService?: AgentSpawnService,
  ) {}
  async spawnContentAgent(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    if (!this.agentSpawnService) {
      return {
        creditsUsed: 0,
        error: 'AgentSpawnService is not available',
        success: false,
      };
    }

    const agentType = params.agentType as AgentType;
    const task = params.task as string;
    const credentialId = params.credentialId as string | undefined;

    if (!agentType || !task) {
      return {
        creditsUsed: 0,
        error: 'agentType and task are required',
        success: false,
      };
    }

    return this.agentSpawnService.spawnSubAgent({
      agentType,
      credentialId,
      parentContext: {
        generationPriority: ctx.generationPriority,
        organizationId: ctx.organizationId,
        userId: ctx.userId,
      },
      task,
    });
  }

  // ──────────────────────────────────────────────
  // CAMPAIGN COORDINATION TOOLS
  // ──────────────────────────────────────────────

  async requestAsset(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const targetAgentId = params.targetAgentId as string | undefined;
    const assetType = params.assetType as string | undefined;
    const prompt = params.prompt as string | undefined;
    const specifications = params.specifications as
      | Record<string, unknown>
      | undefined;

    if (!targetAgentId || !assetType || !prompt) {
      return {
        creditsUsed: 0,
        error: 'targetAgentId, assetType, and prompt are required',
        success: false,
      };
    }

    if (!this.agentSpawnService) {
      return {
        creditsUsed: 0,
        error: 'Agent spawn service not available',
        success: false,
      };
    }

    // Build a comprehensive task from the asset request
    const specsStr = specifications
      ? ` Specifications: ${JSON.stringify(specifications)}`
      : '';
    const task = `Create a ${assetType} asset: ${prompt}.${specsStr}`;

    // Map asset types to agent types for spawning
    const assetTypeToAgentType: Record<string, AgentType> = {
      audio: AgentType.GENERAL,
      image: AgentType.IMAGE_CREATOR,
      text: AgentType.ARTICLE_WRITER,
      video: AgentType.VIDEO_CREATOR,
    };

    const agentType = assetTypeToAgentType[assetType] || AgentType.GENERAL;

    try {
      const result = await this.agentSpawnService.spawnSubAgent({
        agentType,
        parentContext: {
          executionId: ctx.runId,
          generationPriority: ctx.generationPriority,
          organizationId: ctx.organizationId,
          strategyId: targetAgentId,
          userId: ctx.userId,
        },
        task,
      });

      return {
        creditsUsed: result.creditsUsed,
        data: {
          assetType,
          deliveredBy: targetAgentId,
          result: result.data,
        },
        success: result.success,
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      this.loggerService.error(`${this.constructorName} REQUEST_ASSET failed`, {
        error: errorMessage,
        targetAgentId,
      });

      return {
        creditsUsed: 0,
        error: `Asset request failed: ${errorMessage}`,
        success: false,
      };
    }
  }
}
