import { AgentContextAssemblyService } from '@api/services/agent-context-assembly/agent-context-assembly.service';
import type {
  AgentChatContext,
  AgentOrchestratorService,
} from '@api/services/agent-orchestrator/agent-orchestrator.service';
import { DEFAULT_AGENT_CHAT_MODEL } from '@api/services/agent-orchestrator/constants/agent-default-model.constant';
import { getAgentTypeConfig } from '@api/services/agent-orchestrator/constants/agent-type-config.constant';
import { SYSTEM_PROMPT_MANAGER } from '@api/services/agent-spawn/constants/spawn-system-prompt.constant';
import type { AgentToolResult } from '@genfeedai/interfaces';
import { AgentType } from '@genfeedai/enums';
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
      layers: { brandGuidance: true, brandIdentity: true, brandMemory: true },
      organizationId: parentContext.organizationId,
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

    const result = await this.orchestratorService.chat(
      {
        agentType,
        content: task,
        model: brandContext?.defaultModel || DEFAULT_AGENT_CHAT_MODEL,
        source: 'agent',
        systemPromptOverride,
      },
      parentContext,
    );

    return {
      creditsUsed: result.creditsUsed,
      data: {
        agentType,
        content: result.message.content,
        threadId: result.threadId,
        toolCallCount: result.toolCalls.length,
      },
      success: true,
    };
  }
}
