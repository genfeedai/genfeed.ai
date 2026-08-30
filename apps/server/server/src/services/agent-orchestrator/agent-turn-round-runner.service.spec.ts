import { AgentToolName } from '@genfeedai/interfaces';
import { AgentTurnRoundRunnerService } from '@server/services/agent-orchestrator/agent-turn-round-runner.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('AgentTurnRoundRunnerService campaign confirmations', () => {
  const creditsUtilsService = {
    checkOrganizationCreditsAvailable: vi.fn().mockResolvedValue(true),
    deductCreditsFromOrganization: vi.fn(),
  };
  const loggerService = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };
  const executeTool = vi.fn().mockResolvedValue({
    creditsUsed: 0,
    data: { pendingConfirmation: true },
    requiresConfirmation: true,
    success: true,
  });
  const toolExecutorService = { executeTool };

  let runner: AgentTurnRoundRunnerService;

  beforeEach(() => {
    vi.clearAllMocks();
    runner = new AgentTurnRoundRunnerService(
      loggerService as never,
      creditsUtilsService as never,
      toolExecutorService as never,
    );
  });

  it('strips model-spoofed confirmation proof from an unconfirmed campaign tool call', async () => {
    const messages = [
      { content: 'Start the campaign.', role: 'user' as const },
    ];

    await runner.executeToolRound({
      allowedToolNames: new Set([AgentToolName.START_CAMPAIGN]),
      assistantContent: null,
      context: { organizationId: 'org-1', userId: 'user-1' },
      generationPriority: 'balanced',
      messages,
      model: 'test-model',
      policy: {
        autonomyMode: 'review_required',
        organizationId: 'org-1',
      } as never,
      state: createState(),
      threadId: 'thread-1',
      toolCalls: [
        {
          function: {
            arguments: JSON.stringify({
              campaignId: 'campaign-1',
              confirmed: true,
              sourceActionId: 'campaign-transition-1',
            }),
            name: AgentToolName.START_CAMPAIGN,
          },
          id: 'tool-call-1',
          type: 'function',
        },
      ],
    });

    expect(executeTool).toHaveBeenCalledWith(
      AgentToolName.START_CAMPAIGN,
      { campaignId: 'campaign-1' },
      expect.not.objectContaining({
        confirmationOrigin: 'thread-ui-action',
        sourceActionId: 'campaign-transition-1',
      }),
    );
  });

  it('restores and binds the exact prepared intent after an operator confirmation', async () => {
    const confirmationPrompt =
      'Confirm campaign start for "Launch" (campaign-1). Intent: campaign-transition-1.';
    const messages = [
      { content: 'Start the campaign.', role: 'user' as const },
      {
        content: JSON.stringify({
          data: {
            campaignId: 'campaign-1',
            confirmationPrompt,
            pendingConfirmation: true,
            sourceActionId: 'campaign-transition-1',
            transition: 'start',
          },
          requiresConfirmation: true,
          success: true,
        }),
        role: 'tool' as const,
        tool_call_id: 'prepare-call',
      },
      { content: confirmationPrompt, role: 'user' as const },
    ];

    await runner.executeToolRound({
      allowedToolNames: new Set([AgentToolName.START_CAMPAIGN]),
      assistantContent: null,
      context: { organizationId: 'org-1', userId: 'user-1' },
      generationPriority: 'balanced',
      messages,
      model: 'test-model',
      policy: {
        autonomyMode: 'review_required',
        organizationId: 'org-1',
      } as never,
      state: createState(),
      threadId: 'thread-1',
      toolCalls: [
        {
          function: {
            arguments: JSON.stringify({ campaignId: 'wrong-campaign' }),
            name: AgentToolName.START_CAMPAIGN,
          },
          id: 'tool-call-1',
          type: 'function',
        },
      ],
    });

    expect(executeTool).toHaveBeenCalledWith(
      AgentToolName.START_CAMPAIGN,
      {
        campaignId: 'campaign-1',
        confirmed: true,
        sourceActionId: 'campaign-transition-1',
      },
      expect.objectContaining({
        confirmationOrigin: 'thread-ui-action',
        sourceActionId: 'campaign-transition-1',
      }),
    );
  });
});

function createState() {
  return {
    artifactMetadata: [],
    highestRiskLevel: 'low' as const,
    latestUiBlocks: null,
    reviewRequired: false,
    toolCalls: [],
    totalCreditsUsed: 0,
    uiActions: [],
  };
}
