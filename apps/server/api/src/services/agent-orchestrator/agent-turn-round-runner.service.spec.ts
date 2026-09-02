import { randomUUID } from 'node:crypto';
import {
  type AgentToolRoundState,
  AgentTurnRoundRunnerService,
} from '@api/services/agent-orchestrator/agent-turn-round-runner.service';
import type { AgentChatRequest } from '@api/services/agent-orchestrator/interfaces/agent-chat.interface';
import { buildCampaignPreparationCacheKey } from '@api/services/agent-orchestrator/tools/agent-campaign-tool-handler.service';
import { AgentToolConfirmationService } from '@api/services/agent-orchestrator/tools/agent-tool-confirmation.service';
import type { OpenRouterMessage } from '@api/services/integrations/openrouter/dto/openrouter.dto';
import { RouterPriority } from '@genfeedai/enums';
import { AgentToolName } from '@genfeedai/interfaces';
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
  const cachedPreparations = new Map<string, unknown>();
  const cacheService = {
    get: vi.fn(async (key: string) => cachedPreparations.get(key) ?? null),
  };

  let runner: AgentTurnRoundRunnerService;

  beforeEach(() => {
    vi.clearAllMocks();
    cachedPreparations.clear();
    runner = new AgentTurnRoundRunnerService(
      loggerService as never,
      creditsUtilsService as never,
      toolExecutorService as never,
      new AgentToolConfirmationService(
        loggerService as never,
        cacheService as never,
      ),
    );
  });

  function seedPreparedStart(): {
    confirmationPrompt: string;
    sourceActionId: string;
  } {
    const sourceActionId = `campaign-transition-${randomUUID()}`;
    const confirmationPrompt = `Confirm campaign start for campaign campaign-1. Intent: ${sourceActionId}.`;
    cachedPreparations.set(
      buildCampaignPreparationCacheKey({
        organizationId: 'org-1',
        sourceActionId,
        threadId: 'thread-1',
      }),
      {
        brandId: null,
        campaignId: 'campaign-1',
        confirmationPrompt,
        currentStatus: 'draft',
        intendedStatus: 'active',
        label: 'Launch',
        pendingConfirmation: true,
        sourceActionId,
        transition: 'start',
      },
    );
    return { confirmationPrompt, sourceActionId };
  }

  async function executeCampaignRound(params: {
    message: string;
    messages?: OpenRouterMessage[];
    organizationId?: string;
    source?: AgentChatRequest['source'];
    threadId?: string;
    toolParams: Record<string, unknown>;
    toolNames?: AgentToolName[];
    toolName?: AgentToolName.START_CAMPAIGN | AgentToolName.PAUSE_CAMPAIGN;
  }): Promise<{
    messages: OpenRouterMessage[];
    state: AgentToolRoundState;
  }> {
    const organizationId = params.organizationId ?? 'org-1';
    const toolName = params.toolName ?? AgentToolName.START_CAMPAIGN;
    const messages = params.messages ?? [
      { content: params.message, role: 'user' as const },
    ];
    const toolNames = params.toolNames ?? [toolName];
    const state = createState();
    await runner.executeToolRound({
      allowedToolNames: new Set(toolNames),
      assistantContent: null,
      context: { organizationId, userId: 'user-1' },
      generationPriority: RouterPriority.BALANCED,
      messages,
      model: 'test-model',
      policy: {
        autonomyMode: 'review_required',
        organizationId,
      } as never,
      source: params.source,
      state,
      threadId: params.threadId ?? 'thread-1',
      toolCalls: toolNames.map((currentToolName, index) => ({
        function: {
          arguments: JSON.stringify(
            currentToolName === toolName
              ? params.toolParams
              : { campaignId: 'campaign-1' },
          ),
          name: currentToolName,
        },
        id: `tool-call-${index + 1}`,
        type: 'function',
      })),
    });
    return { messages, state };
  }

  it('strips model-spoofed confirmation proof from an unconfirmed campaign tool call', async () => {
    await executeCampaignRound({
      message: 'Start the campaign.',
      toolParams: {
        campaignId: 'campaign-1',
        confirmed: true,
        sourceActionId: 'campaign-transition-1',
      },
    });

    const [toolName, toolParams, executionContext] = executeTool.mock.calls[0];
    expect(toolName).toBe(AgentToolName.START_CAMPAIGN);
    expect(toolParams).toEqual({ campaignId: 'campaign-1' });
    expect(executionContext).not.toHaveProperty('confirmationOrigin');
    expect(executionContext).not.toHaveProperty('sourceActionId');
    expect(loggerService.warn).toHaveBeenCalledWith(
      'Rejected untrusted tool confirmation proof',
      expect.objectContaining({
        campaignId: 'campaign-1',
        organizationId: 'org-1',
        threadId: 'thread-1',
      }),
    );
  });

  it('restores and binds the exact prepared intent after an operator confirmation', async () => {
    const { confirmationPrompt, sourceActionId } = seedPreparedStart();
    runner = new AgentTurnRoundRunnerService(
      loggerService as never,
      creditsUtilsService as never,
      toolExecutorService as never,
      new AgentToolConfirmationService(
        loggerService as never,
        cacheService as never,
      ),
    );

    await executeCampaignRound({
      message: confirmationPrompt,
      toolParams: { campaignId: 'wrong-campaign' },
    });

    expect(executeTool).toHaveBeenCalledWith(
      AgentToolName.START_CAMPAIGN,
      {
        campaignId: 'campaign-1',
        confirmed: true,
        sourceActionId,
      },
      expect.objectContaining({
        confirmationOrigin: 'thread-ui-action',
        sourceActionId,
      }),
    );
  });

  it.each([
    {
      label: 'organization',
      organizationId: 'org-2',
      threadId: 'thread-1',
    },
    {
      label: 'thread',
      organizationId: 'org-1',
      threadId: 'thread-2',
    },
  ])(
    'rejects a persisted confirmation from another $label scope',
    async ({ organizationId, threadId }) => {
      const { confirmationPrompt, sourceActionId } = seedPreparedStart();

      await executeCampaignRound({
        message: confirmationPrompt,
        organizationId,
        threadId,
        toolParams: {
          campaignId: 'campaign-1',
          confirmed: true,
          sourceActionId,
        },
      });

      const [, toolParams, executionContext] = executeTool.mock.calls[0];
      expect(toolParams).toEqual({ campaignId: 'campaign-1' });
      expect(executionContext).not.toHaveProperty('confirmationOrigin');
      expect(executionContext).not.toHaveProperty('sourceActionId');
    },
  );

  it('does not confirm a campaign transition from a proactive turn', async () => {
    const { confirmationPrompt, sourceActionId } = seedPreparedStart();

    await executeCampaignRound({
      message: confirmationPrompt,
      source: 'proactive',
      toolParams: {
        campaignId: 'campaign-1',
        confirmed: true,
        sourceActionId,
      },
    });

    const [, toolParams, executionContext] = executeTool.mock.calls[0];
    expect(toolParams).toEqual({ campaignId: 'campaign-1' });
    expect(executionContext).not.toHaveProperty('confirmationOrigin');
    expect(executionContext).not.toHaveProperty('sourceActionId');
  });

  it('binds confirmation when the campaign tool follows another tool in the round', async () => {
    const { confirmationPrompt, sourceActionId } = seedPreparedStart();

    await executeCampaignRound({
      message: confirmationPrompt,
      toolNames: [
        AgentToolName.GET_CAMPAIGN_ANALYTICS,
        AgentToolName.START_CAMPAIGN,
      ],
      toolParams: { campaignId: 'wrong-campaign' },
    });

    expect(executeTool).toHaveBeenNthCalledWith(
      2,
      AgentToolName.START_CAMPAIGN,
      {
        campaignId: 'campaign-1',
        confirmed: true,
        sourceActionId,
      },
      expect.objectContaining({
        confirmationOrigin: 'thread-ui-action',
        sourceActionId,
      }),
    );
  });

  it('redacts the confirmation nonce from model-visible tool results', async () => {
    const sourceActionId = `campaign-transition-${randomUUID()}`;
    const confirmationPrompt = `Confirm campaign start for campaign campaign-1. Intent: ${sourceActionId}.`;
    executeTool.mockResolvedValueOnce({
      creditsUsed: 0,
      data: {
        campaignId: 'campaign-1',
        confirmationPrompt,
        pendingConfirmation: true,
        sourceActionId,
      },
      nextActions: [
        {
          ctas: [
            {
              action: 'send_prompt',
              label: 'Confirm start',
              payload: { prompt: confirmationPrompt },
            },
          ],
          id: sourceActionId,
          type: 'campaign_control_card',
        },
      ],
      requiresConfirmation: true,
      success: true,
    });

    const { messages, state } = await executeCampaignRound({
      message: 'Start the campaign.',
      toolParams: { campaignId: 'campaign-1' },
    });
    const toolMessage = messages.at(-1);

    expect(toolMessage?.role).toBe('tool');
    expect(toolMessage?.content).not.toContain(sourceActionId);
    expect(toolMessage?.content).not.toContain(confirmationPrompt);
    expect(state.toolCalls[0]?.resultSummary).not.toContain(sourceActionId);
    expect(state.toolCalls[0]?.resultSummary).not.toContain(confirmationPrompt);
  });

  it('does not bind a start preparation to a pause tool call', async () => {
    const { confirmationPrompt, sourceActionId } = seedPreparedStart();

    await executeCampaignRound({
      message: confirmationPrompt,
      toolName: AgentToolName.PAUSE_CAMPAIGN,
      toolParams: {
        campaignId: 'campaign-1',
        confirmed: true,
        sourceActionId,
      },
    });

    const [toolName, toolParams, executionContext] = executeTool.mock.calls[0];
    expect(toolName).toBe(AgentToolName.PAUSE_CAMPAIGN);
    expect(toolParams).toEqual({ campaignId: 'campaign-1' });
    expect(executionContext).not.toHaveProperty('confirmationOrigin');
    expect(executionContext).not.toHaveProperty('sourceActionId');
  });
});

function createState(): AgentToolRoundState {
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
