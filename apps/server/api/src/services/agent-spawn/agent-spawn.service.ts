import { AgentContextAssemblyService } from '@api/services/agent-context-assembly/agent-context-assembly.service';
import { AgentChatModelRegistryService } from '@api/services/agent-orchestrator/agent-chat-model-registry.service';
import type { AgentOrchestratorService } from '@api/services/agent-orchestrator/agent-orchestrator.service';
import { getAgentTypeConfig } from '@api/services/agent-orchestrator/constants/agent-type-config.constant';
import type { AgentChatContext } from '@api/services/agent-orchestrator/interfaces/agent-chat.interface';
import { SYSTEM_PROMPT_MANAGER } from '@api/services/agent-spawn/constants/spawn-system-prompt.constant';
import { AgentType } from '@genfeedai/contracts';
import type { AgentToolResult } from '@genfeedai/contracts/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';

export interface SpawnSubAgentParams {
  agentType: AgentType;
  task: string;
  credentialId?: string;
  parentContext: AgentChatContext;
}

@Injectable()
export class AgentSpawnService implements OnModuleInit {
  private readonly constructorName = String(this.constructor.name);
  private orchestratorService!: AgentOrchestratorService;

  constructor(
    private readonly loggerService: LoggerService,
    private readonly contextAssemblyService: AgentContextAssemblyService,
    private readonly agentChatModelRegistry: AgentChatModelRegistryService,
    private readonly moduleRef: ModuleRef,
  ) {}

  async onModuleInit() {
    const { AgentOrchestratorService } = await import(
      '@api/services/agent-orchestrator/agent-orchestrator.service'
    );
    this.orchestratorService = this.moduleRef.get(AgentOrchestratorService, {
      strict: false,
    });
  }

  async spawnSubAgent(params: SpawnSubAgentParams): Promise<AgentToolResult> {
    const { agentType, task, credentialId, parentContext } = params;

    const typeConfig = getAgentTypeConfig(agentType);

    const brandContext = await this.contextAssemblyService.assembleContext({
      credentialId,
      layers: {
        brandGuidance: true,
        brandIdentity: true,
        brandMemory: true,
        performancePatterns: true,
        ragContext: true,
        recentPosts: true,
      },
      organizationId: parentContext.organizationId,
      query: task,
    });

    const basePrompt =
      SYSTEM_PROMPT_MANAGER.replace(
        '{{date}}',
        new Date().toISOString().split('T')[0],
      ) + (typeConfig.systemPromptSuffix ?? '');
    const systemPromptOverride = brandContext
      ? this.contextAssemblyService.buildSystemPrompt(basePrompt, brandContext)
      : basePrompt;

    this.loggerService.log(
      `${this.constructorName} spawning ${agentType} sub-agent`,
      { agentType, credentialId, organizationId: parentContext.organizationId },
    );

    const acknowledgement = await this.orchestratorService.chat(
      {
        agentType,
        content: task,
        model:
          brandContext?.defaultModel ||
          (await this.agentChatModelRegistry.getDefaultModelKey()),
        source: 'agent',
        systemPromptOverride,
      },
      parentContext,
    );

    // The turn is queued, not executed inline — the owning workflow execution
    // bills its own credits, so the spawn call itself costs nothing.
    return {
      creditsUsed: 0,
      data: {
        agentType,
        executionId: acknowledgement.executionId,
        status: acknowledgement.status,
        threadId: acknowledgement.threadId,
      },
      success: true,
    };
  }
}
