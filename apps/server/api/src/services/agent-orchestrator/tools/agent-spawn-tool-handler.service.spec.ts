import { AgentSpawnToolHandler } from '@api/services/agent-orchestrator/tools/agent-spawn-tool-handler.service';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { AgentType } from '@genfeedai/contracts';
import type { ValidatedAgentScope } from '@genfeedai/contracts/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const validatedScope: ValidatedAgentScope = {
  brandId: 'brand-1',
  contextVersion: 3,
  isLegacyFallback: false,
  isVersionExplicit: true,
  organizationId: 'org-1',
  source: 'explicit',
  threadId: 'thread-1',
  userId: 'user-1',
};

function createContext(
  overrides: Partial<ToolExecutionContext> = {},
): ToolExecutionContext {
  return {
    organizationId: 'org-1',
    userId: 'user-1',
    validatedScope,
    ...overrides,
  };
}

describe('AgentSpawnToolHandler', () => {
  let agentSpawnService: { spawnSubAgent: ReturnType<typeof vi.fn> };
  let handler: AgentSpawnToolHandler;

  beforeEach(() => {
    agentSpawnService = {
      spawnSubAgent: vi.fn().mockResolvedValue({
        creditsUsed: 0,
        data: { threadId: 'sub-thread-1' },
        success: true,
      }),
    };
    handler = new AgentSpawnToolHandler(
      { error: vi.fn() } as unknown as LoggerService,
      agentSpawnService as never,
    );
  });

  it('spawnContentAgent passes the tool context’s validated scope through to the sub-agent', async () => {
    await handler.spawnContentAgent(
      { agentType: AgentType.GENERAL, task: 'Draft a post' },
      createContext(),
    );

    expect(agentSpawnService.spawnSubAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        parentContext: expect.objectContaining({
          organizationId: 'org-1',
          scope: validatedScope,
          userId: 'user-1',
        }),
      }),
    );
  });

  it('requestAsset passes the tool context’s validated scope through to the sub-agent', async () => {
    await handler.requestAsset(
      {
        assetType: 'image',
        prompt: 'A hero banner',
        targetAgentId: 'agent-2',
      },
      createContext(),
    );

    expect(agentSpawnService.spawnSubAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        parentContext: expect.objectContaining({
          organizationId: 'org-1',
          scope: validatedScope,
          userId: 'user-1',
        }),
      }),
    );
  });

  it('spawnContentAgent forwards an undefined scope for an unscoped tool context', async () => {
    await handler.spawnContentAgent(
      { agentType: AgentType.GENERAL, task: 'Draft a post' },
      createContext({ validatedScope: undefined }),
    );

    expect(agentSpawnService.spawnSubAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        parentContext: expect.objectContaining({ scope: undefined }),
      }),
    );
  });
});
