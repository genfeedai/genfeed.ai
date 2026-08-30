import { randomUUID } from 'node:crypto';
import { RouterPriority } from '@genfeedai/enums';
import { AgentToolName } from '@genfeedai/interfaces';
import {
  type AgentToolRoundState,
  AgentTurnRoundRunnerService,
} from '@server/services/agent-orchestrator/agent-turn-round-runner.service';
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

  async function executeStartRound(params: {
    message: string;
    organizationId?: string;
    threadId?: string;
    toolParams: Record<string, unknown>;
  }): Promise<void> {
    const organizationId = params.organizationId ?? 'org-1';
    await runner.executeToolRound({
      allowedToolNames: new Set([AgentToolName.START_CAMPAIGN]),
      assistantContent: null,
      context: { organizationId, userId: 'user-1' },
      generationPriority: RouterPriority.BALANCED,
      messages: [{ content: params.message, role: 'user' }],
      model: 'test-model',
      policy: {
        autonomyMode: 'review_required',
        organizationId,
      } as never,
      state: createState(),
      threadId: params.threadId ?? 'thread-1',
      toolCalls: [
        {
          function: {
            arguments: JSON.stringify(params.toolParams),
            name: AgentToolName.START_CAMPAIGN,
          },
          id: 'tool-call-1',
          type: 'function',
        },
      ],
    });
  }

  it('strips model-spoofed confirmation proof from an unconfirmed campaign tool call', async () => {
    await executeStartRound({
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
      'Rejected untrusted campaign confirmation proof',
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
      cacheService as never,
    );

    await executeStartRound({
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

      await executeStartRound({
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
