import { AgentContextAssemblyService } from '@api/services/agent-context-assembly/agent-context-assembly.service';
import { AgentSpawnService } from '@api/services/agent-spawn/agent-spawn.service';
import { DEFAULT_AGENT_CHAT_MODEL_KEY } from '@genfeedai/constants';
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
      {} as never,
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
      clientRequestId: 'client-request-1',
      contextId: 'context-1',
      contextVersion: 1,
      executionId: 'execution-123',
      queuedAt: '2026-08-29T00:00:00.000Z',
      status: 'queued',
      threadId: 'thread-123',
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
      {
        getDefaultModelKey: vi
          .fn()
          .mockResolvedValue(DEFAULT_AGENT_CHAT_MODEL_KEY),
      } as never,
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
        model: DEFAULT_AGENT_CHAT_MODEL_KEY,
      }),
      expect.objectContaining({
        organizationId: 'org-1',
        userId: 'user-1',
      }),
    );
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
  });

  it('assembles brand context with brandMemory + performancePatterns + recentPosts enabled (#3019)', async () => {
    const chat = vi.fn().mockResolvedValue({
      clientRequestId: 'client-request-1',
      contextId: 'context-1',
      contextVersion: 1,
      executionId: 'execution-123',
      queuedAt: '2026-08-29T00:00:00.000Z',
      status: 'queued',
      threadId: 'thread-123',
    });
    const assembleContext = vi.fn().mockResolvedValue({
      brandId: 'brand-1',
      brandName: 'Brand',
      layersUsed: ['brandIdentity'],
    });

    const service = new AgentSpawnService(
      { log: vi.fn() } as unknown as LoggerService,
      {
        assembleContext,
        buildSystemPrompt: vi.fn().mockReturnValue('spawn-prompt'),
      } as unknown as AgentContextAssemblyService,
      {
        getDefaultModelKey: vi
          .fn()
          .mockResolvedValue(DEFAULT_AGENT_CHAT_MODEL_KEY),
      } as never,
      { get: vi.fn() } as never,
    );

    (
      service as unknown as {
        orchestratorService: { chat: typeof chat };
      }
    ).orchestratorService = { chat };

    await service.spawnSubAgent({
      agentType: AgentType.X_CONTENT,
      credentialId: 'credential-1',
      parentContext: {
        organizationId: 'org-1',
        userId: 'user-1',
      },
      task: 'Draft an X thread',
    });

    expect(assembleContext).toHaveBeenCalledWith(
      expect.objectContaining({
        layers: {
          brandGuidance: true,
          brandIdentity: true,
          brandMemory: true,
          performancePatterns: true,
          ragContext: true,
          recentPosts: true,
        },
        query: 'Draft an X thread',
      }),
    );
  });

  it('uses the brand default model when the brand context provides one', async () => {
    const chat = vi.fn().mockResolvedValue({
      clientRequestId: 'client-request-1',
      contextId: 'context-1',
      contextVersion: 1,
      executionId: 'execution-123',
      queuedAt: '2026-08-29T00:00:00.000Z',
      status: 'queued',
      threadId: 'thread-123',
    });

    const service = new AgentSpawnService(
      { log: vi.fn() } as unknown as LoggerService,
      {
        assembleContext: vi.fn().mockResolvedValue({
          brandId: 'brand-1',
          brandName: 'Brand',
          defaultModel: 'anthropic/claude-sonnet-5',
          layersUsed: ['brandIdentity'],
        }),
        buildSystemPrompt: vi.fn().mockReturnValue('spawn-prompt'),
      } as unknown as AgentContextAssemblyService,
      {
        getDefaultModelKey: vi
          .fn()
          .mockResolvedValue(DEFAULT_AGENT_CHAT_MODEL_KEY),
      } as never,
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
        model: 'anthropic/claude-sonnet-5',
      }),
      expect.any(Object),
    );
  });
});
