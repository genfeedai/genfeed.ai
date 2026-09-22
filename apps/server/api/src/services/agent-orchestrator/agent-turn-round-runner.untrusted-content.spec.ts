import {
  type AgentToolRoundState,
  AgentTurnRoundRunnerService,
} from '@api/services/agent-orchestrator/agent-turn-round-runner.service';
import type { OpenRouterMessage } from '@api/services/integrations/openrouter/dto/openrouter.dto';
import { RouterPriority } from '@genfeedai/contracts';
import type { AgentUntrustedContentGateResult } from '@genfeedai/contracts/interfaces';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The gate's wiring into the shared tool-result path (#4870): both
 * orchestrator loops push their tool messages through this runner, so this is
 * the one seam that decides what reaches the model context.
 */
describe('AgentTurnRoundRunnerService untrusted-content gate', () => {
  const loggerService = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };
  const creditsUtilsService = {
    checkOrganizationCreditsAvailable: vi.fn().mockResolvedValue(true),
    deductCreditsFromOrganization: vi.fn(),
  };
  const executeTool = vi.fn().mockResolvedValue({
    creditsUsed: 0,
    data: { snippet: 'the fetched article body' },
    success: true,
  });
  const toolConfirmationService = {
    buildModelVisibleResult: vi.fn(
      (_toolName: string, result: Record<string, unknown>) => result,
    ),
    prepareToolCall: vi.fn(async () => ({ parameters: {} })),
  };
  const evaluateToolResult =
    vi.fn<
      (params: { content: string }) => Promise<AgentUntrustedContentGateResult>
    >();

  function createState(): AgentToolRoundState {
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

  async function runRound(): Promise<OpenRouterMessage[]> {
    const runner = new AgentTurnRoundRunnerService(
      loggerService as never,
      creditsUtilsService as never,
      { executeTool } as never,
      toolConfirmationService as never,
      { evaluateToolResult } as never,
    );
    const messages: OpenRouterMessage[] = [
      { content: 'Research this page', role: 'user' as const },
    ];

    await runner.executeToolRound({
      allowedToolNames: new Set(['search_knowledge']),
      assistantContent: null,
      context: { organizationId: 'org-1', userId: 'user-1' },
      generationPriority: RouterPriority.BALANCED,
      messages,
      model: 'test-model',
      policy: { brandId: 'brand-1', organizationId: 'org-1' } as never,
      state: createState(),
      threadId: 'thread-1',
      toolCalls: [
        {
          function: { arguments: '{}', name: 'search_knowledge' },
          id: 'tool-call-1',
          type: 'function',
        },
      ],
    });

    return messages;
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('pushes the gate’s content, not the raw serialization', async () => {
    evaluateToolResult.mockResolvedValue({
      confidence: 0.98,
      content: '{"error":"tool result withheld","success":false}',
      outcome: 'withheld',
    });

    const messages = await runRound();
    const toolMessage = messages.at(-1);

    expect(toolMessage?.role).toBe('tool');
    expect(toolMessage?.content).toBe(
      '{"error":"tool result withheld","success":false}',
    );
    expect(toolMessage?.content).not.toContain('the fetched article body');
  });

  it('passes the serialized result, the tool and the run scope to the gate', async () => {
    evaluateToolResult.mockImplementation(async ({ content }) => ({
      content,
      outcome: 'allowed',
    }));

    await runRound();

    expect(evaluateToolResult).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId: 'brand-1',
        threadId: 'thread-1',
        toolCallId: 'tool-call-1',
        toolName: 'search_knowledge',
      }),
    );
    const sent = evaluateToolResult.mock.calls[0]?.[0];
    expect(JSON.parse(String(sent?.content))).toEqual({
      creditsUsed: 0,
      data: { snippet: 'the fetched article body' },
      success: true,
    });
  });

  it('leaves an allowed result byte-for-byte unchanged', async () => {
    evaluateToolResult.mockImplementation(async ({ content }) => ({
      content,
      outcome: 'allowed',
    }));

    const messages = await runRound();

    expect(messages.at(-1)?.content).toBe(
      JSON.stringify({
        creditsUsed: 0,
        data: { snippet: 'the fetched article body' },
        success: true,
      }),
    );
  });

  it('still records the tool call as completed when content is withheld', async () => {
    evaluateToolResult.mockResolvedValue({
      confidence: 0.99,
      content: '{"error":"tool result withheld","success":false}',
      outcome: 'withheld',
    });
    const onToolCompleted = vi.fn();
    const runner = new AgentTurnRoundRunnerService(
      loggerService as never,
      creditsUtilsService as never,
      { executeTool } as never,
      toolConfirmationService as never,
      { evaluateToolResult } as never,
    );
    const state = createState();

    await runner.executeToolRound({
      allowedToolNames: new Set(['search_knowledge']),
      assistantContent: null,
      context: { organizationId: 'org-1', userId: 'user-1' },
      generationPriority: RouterPriority.BALANCED,
      messages: [],
      model: 'test-model',
      policy: { organizationId: 'org-1' } as never,
      state,
      strategy: { onToolCompleted },
      threadId: 'thread-1',
      toolCalls: [
        {
          function: { arguments: '{}', name: 'search_knowledge' },
          id: 'tool-call-1',
          type: 'function',
        },
      ],
    });

    expect(onToolCompleted).toHaveBeenCalledOnce();
    expect(state.toolCalls[0]?.status).toBe('completed');
  });
});
