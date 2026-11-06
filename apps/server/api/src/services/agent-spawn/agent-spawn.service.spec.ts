import type { AgentContextAssemblyService } from '@api/services/agent-context-assembly/agent-context-assembly.service';
import type { AgentChatModelRegistryService } from '@api/services/agent-orchestrator/agent-chat-model-registry.service';
import { AgentSpawnService } from '@api/services/agent-spawn/agent-spawn.service';
import { AgentType } from '@genfeedai/contracts';
import { DEFAULT_AGENT_CHAT_MODEL_KEY } from '@genfeedai/contracts/constants';
import type { LoggerService } from '@libs/logger/logger.service';
import type { ModuleRef } from '@nestjs/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockedAgentOrchestratorToken } = vi.hoisted(() => ({
  mockedAgentOrchestratorToken: Symbol('AgentOrchestratorService'),
}));

vi.mock('@api/services/agent-orchestrator/agent-orchestrator.service', () => ({
  AgentOrchestratorService: mockedAgentOrchestratorToken,
}));

interface ChatTurn {
  context: Record<string, unknown>;
  request: Record<string, unknown>;
}

interface BrandContext {
  brandId: string;
  brandName: string;
  defaultModel?: string;
  layersUsed: string[];
}

describe('AgentSpawnService', () => {
  const parentContext = { organizationId: 'org-1', userId: 'user-1' };

  let brandContext: BrandContext;
  let contextRequests: Array<Record<string, unknown>>;
  let turns: ChatTurn[];
  let lookups: Array<{ options: unknown; token: unknown }>;
  let service: AgentSpawnService;

  beforeEach(async () => {
    brandContext = {
      brandId: 'brand-1',
      brandName: 'Brand',
      layersUsed: ['brandIdentity'],
    };
    contextRequests = [];
    turns = [];
    lookups = [];

    const orchestrator = {
      chat: async (
        request: Record<string, unknown>,
        context: Record<string, unknown>,
      ) => {
        turns.push({ context, request });
        return {
          clientRequestId: 'client-request-1',
          contextId: 'context-1',
          contextVersion: 1,
          executionId: 'execution-123',
          queuedAt: '2026-08-29T00:00:00.000Z',
          status: 'queued',
          threadId: 'thread-123',
        };
      },
    };
    const moduleRef = {
      get: (token: unknown, options: unknown) => {
        lookups.push({ options, token });
        return token === mockedAgentOrchestratorToken ? orchestrator : null;
      },
    };

    service = new AgentSpawnService(
      { log: () => undefined } as unknown as LoggerService,
      {
        assembleContext: async (input: Record<string, unknown>) => {
          contextRequests.push(input);
          return brandContext;
        },
        buildSystemPrompt: (base: string, context: BrandContext) =>
          `${base}\n[brand:${context.brandName}]`,
      } as unknown as AgentContextAssemblyService,
      {
        getDefaultModelKey: async () => DEFAULT_AGENT_CHAT_MODEL_KEY,
      } as unknown as AgentChatModelRegistryService,
      moduleRef as unknown as ModuleRef,
    );
    await service.onModuleInit();
  });

  it('resolves the orchestrator non-strictly on module init', () => {
    expect(lookups).toEqual([
      { options: { strict: false }, token: mockedAgentOrchestratorToken },
    ]);
  });

  it('queues the task as a sub-agent turn and returns its thread', async () => {
    const result = await service.spawnSubAgent({
      agentType: AgentType.X_CONTENT,
      credentialId: 'credential-1',
      parentContext,
      task: 'Draft an X thread',
    });

    expect(result).toEqual({
      creditsUsed: 0,
      data: {
        agentType: AgentType.X_CONTENT,
        executionId: 'execution-123',
        status: 'queued',
        threadId: 'thread-123',
      },
      success: true,
    });
    expect(turns).toEqual([
      {
        context: parentContext,
        request: expect.objectContaining({
          agentType: AgentType.X_CONTENT,
          content: 'Draft an X thread',
          model: DEFAULT_AGENT_CHAT_MODEL_KEY,
          source: 'agent',
          systemPromptOverride: expect.stringContaining('[brand:Brand]'),
        }),
      },
    ]);
  });

  it('assembles brand context with brandMemory + performancePatterns + recentPosts enabled (#3019)', async () => {
    await service.spawnSubAgent({
      agentType: AgentType.X_CONTENT,
      credentialId: 'credential-1',
      parentContext,
      task: 'Draft an X thread',
    });

    expect(contextRequests).toEqual([
      expect.objectContaining({
        credentialId: 'credential-1',
        layers: {
          brandGuidance: true,
          brandIdentity: true,
          brandMemory: true,
          performancePatterns: true,
          ragContext: true,
          recentPosts: true,
        },
        organizationId: 'org-1',
        query: 'Draft an X thread',
        userId: 'user-1',
      }),
    ]);
  });

  it('uses the brand default model when the brand context provides one', async () => {
    brandContext = {
      ...brandContext,
      defaultModel: 'anthropic/claude-sonnet-5',
    };

    await service.spawnSubAgent({
      agentType: AgentType.X_CONTENT,
      parentContext,
      task: 'Draft an X thread',
    });

    expect(turns[0]?.request.model).toBe('anthropic/claude-sonnet-5');
  });
});
