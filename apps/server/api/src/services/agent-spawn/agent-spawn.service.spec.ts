import { AgentContextAssemblyService } from '@api/services/agent-context-assembly/agent-context-assembly.service';
import { AgentSpawnService } from '@api/services/agent-spawn/agent-spawn.service';
import { AgentType } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { describe, expect, it, vi } from 'vitest';

const { mockedAgentOrchestratorToken } = vi.hoisted(() => ({
  mockedAgentOrchestratorToken: Symbol('AgentOrchestratorService'),
}));

vi.mock('@api/services/agent-orchestrator/agent-orchestrator.service', () => ({
  AgentOrchestratorService: mockedAgentOrchestratorToken,
}));

describe('AgentSpawnService', () => {
  it('hydrates the orchestrator from ModuleRef on module init', async () => {
    const orchestratorService = {
      chat: vi.fn(),
    };
    const moduleRef = {
      get: vi.fn().mockReturnValue(orchestratorService),
    };

    const service = new AgentSpawnService(
      { log: vi.fn() } as unknown as LoggerService,
      {} as AgentContextAssemblyService,
      moduleRef as never,
    );

    await service.onModuleInit();

    expect(moduleRef.get).toHaveBeenCalledWith(mockedAgentOrchestratorToken, {
      strict: false,
    });
    expect(
      (service as { orchestratorService?: unknown }).orchestratorService,
    ).toBe(orchestratorService);
  });

  it('returns the spawned sub-agent threadId in tool result data', async () => {
    const chat = vi.fn().mockResolvedValue({
      creditsUsed: 7,
      message: {
        content: 'Spawned agent response',
        metadata: {},
        role: 'assistant',
      },
      threadId: 'thread-123',
      toolCalls: [{ status: 'completed', toolName: 'generate_content' }],
    });

    const service = new AgentSpawnService(
      { log: vi.fn() } as unknown as LoggerService,
      {
        assembleContext: vi.fn().mockResolvedValue({
          brandId: 'brand-1',
          brandName: 'Brand',
          layersUsed: ['brandIdentity'],
        }),
        buildSystemPrompt: vi.fn().mockReturnValue('spawn-prompt'),
      } as unknown as AgentContextAssemblyService,
      { get: vi.fn() } as never,
    );

    (
      service as unknown as {
        orchestratorService: { chat: typeof chat };
      }
    ).orchestratorService = { chat };

    const result = await service.spawnSubAgent({
      agentType: AgentType.X_CONTENT,
      credentialId: 'credential-1',
      parentContext: {
        organizationId: 'org-1',
        userId: 'user-1',
      },
      task: 'Draft an X thread',
    });

    expect(chat).toHaveBeenCalledWith(
      expect.objectContaining({
        agentType: AgentType.X_CONTENT,
        content: 'Draft an X thread',
        model: 'openrouter/auto',
      }),
      expect.objectContaining({
        organizationId: 'org-1',
        userId: 'user-1',
      }),
    );
    expect(result).toEqual({
      creditsUsed: 7,
      data: {
        agentType: AgentType.X_CONTENT,
        content: 'Spawned agent response',
        threadId: 'thread-123',
        toolCallCount: 1,
      },
      success: true,
    });
  });

  it('uses the brand default model when the brand context provides one', async () => {
    const chat = vi.fn().mockResolvedValue({
      creditsUsed: 0,
      message: {
        content: 'done',
        metadata: {},
        role: 'assistant',
      },
      threadId: 'thread-123',
      toolCalls: [],
    });

    const service = new AgentSpawnService(
      { log: vi.fn() } as unknown as LoggerService,
      {
        assembleContext: vi.fn().mockResolvedValue({
          brandId: 'brand-1',
          brandName: 'Brand',
          defaultModel: 'anthropic/claude-sonnet-4-5-20250929',
          layersUsed: ['brandIdentity'],
        }),
        buildSystemPrompt: vi.fn().mockReturnValue('spawn-prompt'),
      } as unknown as AgentContextAssemblyService,
      { get: vi.fn() } as never,
    );

    (
      service as unknown as {
        orchestratorService: { chat: typeof chat };
      }
    ).orchestratorService = { chat };

    await service.spawnSubAgent({
      agentType: AgentType.X_CONTENT,
      parentContext: {
        organizationId: 'org-1',
        userId: 'user-1',
      },
      task: 'Draft an X thread',
    });

    expect(chat).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'anthropic/claude-sonnet-4-5-20250929',
      }),
      expect.any(Object),
    );
  });
});
