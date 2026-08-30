import { randomUUID } from 'node:crypto';
import { RouterPriority } from '@genfeedai/enums';
import { AgentToolName } from '@genfeedai/interfaces';
import { AgentTurnRoundRunnerService } from '@server/services/agent-orchestrator/agent-turn-round-runner.service';
import { buildCampaignPreparationCacheKey } from '@server/services/agent-orchestrator/tools/agent-campaign-tool-handler.service';
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
      cacheService as never,
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
      generationPriority: RouterPriority.BALANCED,
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
    const sourceActionId = `campaign-transition-${randomUUID()}`;
    const confirmationPrompt = `Confirm campaign start for campaign campaign-1. Intent: ${sourceActionId}.`;
    cachedPreparations.set(
      buildCampaignPreparationCacheKey({
        organizationId: 'org-1',
        sourceActionId,
        threadId: 'thread-1',
      }),
      {
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
    const messages = [{ content: confirmationPrompt, role: 'user' as const }];

    await runner.executeToolRound({
      allowedToolNames: new Set([AgentToolName.START_CAMPAIGN]),
      assistantContent: null,
      context: { organizationId: 'org-1', userId: 'user-1' },
      generationPriority: RouterPriority.BALANCED,
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
        sourceActionId,
      },
      expect.objectContaining({
        confirmationOrigin: 'thread-ui-action',
        sourceActionId,
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
