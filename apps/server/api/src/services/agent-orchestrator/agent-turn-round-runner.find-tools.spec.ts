import { AgentTurnRoundRunnerService } from '@api/services/agent-orchestrator/agent-turn-round-runner.service';
import type { AgentToolRoundState } from '@api/services/agent-orchestrator/interfaces/agent-turn-round-runner.interface';
import { AgentToolConfirmationService } from '@api/services/agent-orchestrator/tools/agent-tool-confirmation.service';
import { buildToolDefinitions } from '@api/services/agent-orchestrator/utils/agent-tool-definitions.util';
import { createTurnToolset } from '@api/services/agent-orchestrator/utils/agent-tool-discovery.util';
import type { OpenRouterMessage } from '@api/services/integrations/openrouter/dto/openrouter.dto';
import type { CuratedActionName } from '@genfeedai/actions';
import { RouterPriority } from '@genfeedai/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('AgentTurnRoundRunnerService find_tools', () => {
  const loggerService = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };
  const executeTool = vi.fn();
  const untrustedContentGateService = {
    evaluateToolResult: vi.fn(async ({ content }: { content: string }) => ({
      content,
      outcome: 'allowed' as const,
    })),
  };
  const catalog = buildToolDefinitions();
  const allowedToolNames = new Set(
    catalog.map((tool) => tool.function.name as CuratedActionName),
  );
  let runner: AgentTurnRoundRunnerService;

  beforeEach(() => {
    vi.clearAllMocks();
    executeTool.mockResolvedValue({ creditsUsed: 0, data: {}, success: true });
    runner = new AgentTurnRoundRunnerService(
      loggerService as never,
      {
        checkOrganizationCreditsAvailable: vi.fn().mockResolvedValue(true),
        deductCreditsFromOrganization: vi.fn(),
      } as never,
      { executeTool } as never,
      new AgentToolConfirmationService(
        loggerService as never,
        {
          get: vi.fn().mockResolvedValue(null),
        } as never,
      ),
      untrustedContentGateService as never,
    );
  });

  function state(): AgentToolRoundState {
    return {
      artifactMetadata: [],
      highestRiskLevel: 'low',
      latestUiBlocks: null,
      reviewRequired: false,
      toolCalls: [],
      totalCreditsUsed: 0,
      uiActions: [],
    };
  }

  async function callTool(
    toolset: ReturnType<typeof createTurnToolset>,
    name: string,
    args: Record<string, unknown>,
  ): Promise<OpenRouterMessage[]> {
    const messages: OpenRouterMessage[] = [
      { content: 'Plan my week', role: 'user' },
    ];
    await runner.executeToolRound({
      allowedToolNames,
      assistantContent: null,
      context: { organizationId: 'org-1', userId: 'user-1' },
      generationPriority: RouterPriority.BALANCED,
      messages,
      model: 'test-model',
      policy: { organizationId: 'org-1' } as never,
      state: state(),
      threadId: 'thread-1',
      toolCalls: [
        {
          function: { arguments: JSON.stringify(args), name },
          id: 'tool-1',
          type: 'function',
        },
      ],
      toolset,
    });
    return messages;
  }

  it('answers a search with the loaded tools and runs no tool', async () => {
    const toolset = createTurnToolset(catalog);

    const messages = await callTool(toolset, 'find_tools', {
      query: 'storyboard',
    });

    const answer = JSON.parse(String(messages.at(-1)?.content));
    expect(answer.success).toBe(true);
    expect(
      answer.data.found.map((tool: { name: string }) => tool.name),
    ).toContain('storyboard_video');
    expect(messages.at(-1)).toMatchObject({
      role: 'tool',
      tool_call_id: 'tool-1',
    });
    expect(executeTool).not.toHaveBeenCalled();
    expect(toolset.roundTools().map((tool) => tool.function.name)).toContain(
      'storyboard_video',
    );
  });

  it('keeps a tool that was called by name loaded for the later rounds', async () => {
    const toolset = createTurnToolset(catalog);
    const before = toolset.roundTools().map((tool) => tool.function.name);
    expect(before).not.toContain('get_workflow_runs');

    await callTool(toolset, 'get_workflow_runs', {});

    expect(executeTool).toHaveBeenCalledTimes(1);
    expect(toolset.roundTools().map((tool) => tool.function.name)).toContain(
      'get_workflow_runs',
    );
  });

  it('treats find_tools as an unknown tool when the turn sends every tool', async () => {
    const toolset = createTurnToolset(catalog.slice(0, 10));

    const messages = await callTool(toolset, 'find_tools', { query: 'post' });

    expect(JSON.parse(String(messages.at(-1)?.content)).success).toBe(false);
    expect(executeTool).not.toHaveBeenCalled();
  });
});
