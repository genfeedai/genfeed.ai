import { randomUUID } from 'node:crypto';
import { BusinessLogicException } from '@api/exceptions/business-logic.exception';
import { AgentCompletionCardBuilderService } from '@api/services/agent-orchestrator/agent-completion-card-builder.service';
import {
  AgentTurnRoundRunnerService,
  assertAgentCreditBudget,
} from '@api/services/agent-orchestrator/agent-turn-round-runner.service';
import type { AgentChatRequest } from '@api/services/agent-orchestrator/interfaces/agent-chat.interface';
import type { AgentToolRoundState } from '@api/services/agent-orchestrator/interfaces/agent-turn-round-runner.interface';
import {
  buildCampaignConfirmationPrompt,
  buildCampaignPreparationCacheKey,
} from '@api/services/agent-orchestrator/tools/agent-campaign-tool-handler.service';
import { AgentToolConfirmationService } from '@api/services/agent-orchestrator/tools/agent-tool-confirmation.service';
import type { OpenRouterMessage } from '@api/services/integrations/openrouter/dto/openrouter.dto';
import type { CuratedActionName } from '@genfeedai/actions';
import { AgentGenerationMode, RouterPriority } from '@genfeedai/contracts';
import {
  type GenerationEntry,
  GenerationEntryAttribution,
  GenerationEntryChannel,
} from '@genfeedai/contracts/interfaces/content/generation-entry.interface';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
  // #4870: the gate is `off` by default and hands back what it was given.
  const untrustedContentGateService = {
    evaluateToolResult: vi.fn(async ({ content }: { content: string }) => ({
      content,
      outcome: 'allowed' as const,
    })),
  };
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
      untrustedContentGateService as never,
    );
  });

  function seedPreparedStart(): {
    confirmationPrompt: string;
    sourceActionId: string;
  } {
    const sourceActionId = `campaign-transition-${randomUUID()}`;
    const confirmationPrompt = buildCampaignConfirmationPrompt({
      campaignId: 'campaign-1',
      sourceActionId,
      transition: 'start',
    });
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
    generationEntry?: GenerationEntry;
    messages?: OpenRouterMessage[];
    organizationId?: string;
    source?: AgentChatRequest['source'];
    threadId?: string;
    toolParams: Record<string, unknown>;
    toolNames?: CuratedActionName[];
    toolName?: CuratedActionName;
  }): Promise<{
    messages: OpenRouterMessage[];
    state: AgentToolRoundState;
  }> {
    const organizationId = params.organizationId ?? 'org-1';
    const toolName = params.toolName ?? 'start_outreach_sequence';
    const messages = params.messages ?? [
      { content: params.message, role: 'user' as const },
    ];
    const toolNames = params.toolNames ?? [toolName];
    const state = createState();
    await runner.executeToolRound({
      allowedToolNames: new Set(toolNames),
      assistantContent: null,
      context: {
        organizationId,
        userId: 'user-1',
        generationEntry: params.generationEntry,
        requestedSkillSlugs: ['cinema'],
      },
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

  it('carries the current invocation entry to tool execution', async () => {
    const generationEntry = {
      channel: GenerationEntryChannel.WEB,
      attribution: GenerationEntryAttribution.CLIENT_REPORTED,
    };
    await executeCampaignRound({
      message: 'Show review queue',
      toolName: 'get_review_queue',
      toolParams: {},
      generationEntry,
    });
    expect(executeTool).toHaveBeenCalledWith(
      'get_review_queue',
      {},
      expect.objectContaining({
        generationEntry,
        userId: 'user-1',
        organizationId: 'org-1',
      }),
    );
  });

  it('keeps the full tool result for the model when the timeline summary is a sentence', async () => {
    const details = 'x'.repeat(1000);
    executeTool.mockResolvedValueOnce({
      creditsUsed: 0,
      success: true,
      data: {
        approvedCount: 0,
        changesRequestedCount: 0,
        pendingCount: 0,
        readyCount: 0,
        recentItems: [],
        details,
      },
    });
    const { messages, state } = await executeCampaignRound({
      message: "Show me what's waiting for review",
      toolName: 'get_review_queue',
      toolParams: {},
    });
    expect(state.toolCalls[0]?.resultSummary).toBe(
      'Nothing waiting for review',
    );
    expect(state.toolCalls[0]?.resultSummary).not.toContain(details);
    expect(messages.at(-1)?.content).toContain(details);
    expect(state.toolCalls[0]?.reviewQueue).toEqual({
      approvedCount: 0,
      changesRequestedCount: 0,
      pendingCount: 0,
      readyCount: 0,
      scope: 'inbox' as const,
    });
    const result =
      new AgentCompletionCardBuilderService().buildAssistantUiActions({
        reviewRequired: state.reviewRequired,
        toolCalls: state.toolCalls,
        uiActions: state.uiActions,
      });
    expect(result.suggestedActions.map((action) => action.id)).toEqual([
      'review-create',
      'review-ideas',
    ]);
  });

  const knowledgeSearchResult = {
    creditsUsed: 0,
    data: {
      passages: [
        {
          citation: {
            kind: 'TEXT',
            purpose: 'BRAND_TRUTH',
            sourceId: 'source-1',
            title: 'Pricing',
            version: 1,
            versionId: 'version-1',
          },
          content: 'Plans start at $29 per month.',
          relevance: 0.9,
        },
      ],
      query: 'pricing',
    },
    success: true,
  };

  it('numbers Knowledge passages for the model and remembers them for citation', async () => {
    executeTool.mockResolvedValueOnce(knowledgeSearchResult);
    const { messages, state } = await executeCampaignRound({
      message: 'What does the starter plan cost?',
      toolName: 'search_knowledge',
      toolParams: { brandId: 'brand-9', query: 'pricing' },
    });
    const seen = JSON.parse(String(messages.at(-1)?.content));
    expect(seen.data.passages[0].passageId).toBe('p1');
    expect(seen.data.citationInstruction).toContain('[[cite:<passageId>]]');
    expect(state.knowledgePassages?.get('p1')).toEqual({
      brandId: 'brand-9',
      receipt: expect.objectContaining({
        excerpt: 'Plans start at $29 per month.',
        versionId: 'version-1',
      }),
    });
  });

  it('does not let the model cite a result the injection gate withheld', async () => {
    executeTool.mockResolvedValueOnce(knowledgeSearchResult);
    untrustedContentGateService.evaluateToolResult.mockResolvedValueOnce({
      content: 'Tool result withheld.',
      outcome: 'withheld' as never,
    });
    const { messages, state } = await executeCampaignRound({
      message: 'What does the starter plan cost?',
      toolName: 'search_knowledge',
      toolParams: { query: 'pricing' },
    });
    expect(messages.at(-1)?.content).toBe('Tool result withheld.');
    expect(state.knowledgePassages?.size).toBe(0);
  });

  it('marks a Stop observed after an awaited tool as interrupted', async () => {
    const result = await runner.executeToolRound({
      allowedToolNames: new Set(['start_outreach_sequence']),
      assistantContent: null,
      context: {
        organizationId: 'org-1',
        userId: 'user-1',
        executionId: 'run-in-flight',
      },
      generationPriority: RouterPriority.BALANCED,
      messages: [{ role: 'user', content: 'Start the campaign' }],
      model: 'test-model',
      policy: { organizationId: 'org-1' } as never,
      state: createState(),
      threadId: 'thread-1',
      strategy: { onAfterTool: async () => 'cancel' },
      toolCalls: [
        {
          id: 'tool-1',
          type: 'function',
          function: {
            name: 'start_outreach_sequence',
            arguments: JSON.stringify({ campaignId: 'campaign-1' }),
          },
        },
      ],
    });
    expect(executeTool).toHaveBeenCalledOnce();
    expect(result).toEqual({ isCancelled: true, wasInterrupted: true });
  });

  describe('a tool call that never settles', () => {
    function hungToolRound(strategy?: {
      onBeforeTool: () => Promise<'cancel' | 'continue'>;
    }) {
      const state = createState();
      const round = runner.executeToolRound({
        allowedToolNames: new Set(['start_outreach_sequence']),
        assistantContent: null,
        context: {
          executionId: 'run-in-flight',
          organizationId: 'org-1',
          userId: 'user-1',
        },
        generationPriority: RouterPriority.BALANCED,
        messages: [{ content: 'Start the campaign', role: 'user' }],
        model: 'test-model',
        policy: { organizationId: 'org-1' } as never,
        state,
        strategy,
        threadId: 'thread-1',
        toolCalls: [
          {
            function: {
              arguments: JSON.stringify({ campaignId: 'campaign-1' }),
              name: 'start_outreach_sequence',
            },
            id: 'tool-1',
            type: 'function',
          },
        ],
      });
      return { round, state };
    }

    beforeEach(() => {
      vi.useFakeTimers();
      executeTool.mockImplementationOnce(() => new Promise(() => undefined));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('stops waiting as soon as the run is cancelled', async () => {
      let checks = 0;
      const { round } = hungToolRound({
        // The first check is the pre-tool gate; Stop lands while the tool hangs.
        onBeforeTool: async () => (++checks > 1 ? 'cancel' : 'continue'),
      });

      await vi.advanceTimersByTimeAsync(1500);

      await expect(round).resolves.toEqual({
        isCancelled: true,
        wasInterrupted: true,
      });
    });

    it('fails the tool instead of holding the turn forever', async () => {
      const { round, state } = hungToolRound();

      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

      await expect(round).resolves.toMatchObject({ isCancelled: false });
      expect(state.toolCalls).toEqual([
        expect.objectContaining({
          error: 'start_outreach_sequence did not finish within 300s',
          status: 'failed',
        }),
      ]);
    });
  });

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
    expect(toolName).toBe('start_outreach_sequence');
    expect(executionContext.requestedSkillSlugs).toEqual(['cinema']);
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
      untrustedContentGateService as never,
    );

    await executeCampaignRound({
      message: confirmationPrompt,
      toolParams: { campaignId: 'wrong-campaign' },
    });

    expect(executeTool).toHaveBeenCalledWith(
      'start_outreach_sequence',
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
      toolNames: ['get_outreach_sequence_analytics', 'start_outreach_sequence'],
      toolParams: { campaignId: 'wrong-campaign' },
    });

    expect(executeTool).toHaveBeenNthCalledWith(
      2,
      'start_outreach_sequence',
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
    const confirmationPrompt = buildCampaignConfirmationPrompt({
      campaignId: 'campaign-1',
      sourceActionId,
      transition: 'start',
    });
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
          type: 'outreach_sequence_control_card',
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
      toolName: 'pause_outreach_sequence',
      toolParams: {
        campaignId: 'campaign-1',
        confirmed: true,
        sourceActionId,
      },
    });

    const [toolName, toolParams, executionContext] = executeTool.mock.calls[0];
    expect(toolName).toBe('pause_outreach_sequence');
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

describe('capped autonomous credit preflight', () => {
  it('accepts exact caps and rejects invalid, exhausted, or unknown paid quotes', () => {
    expect(() =>
      assertAgentCreditBudget({ creditBudget: 5 }, 3, 2),
    ).not.toThrow();
    expect(() => assertAgentCreditBudget({}, 100, 10)).not.toThrow();
    for (const [cap, consumed, estimate] of [
      [0, 0, 0],
      [5, 4, 2],
      [NaN, 0, 1],
      [5, 0, NaN],
      [5, 0, Infinity],
      [-1, 0, 1],
    ]) {
      expect(() =>
        assertAgentCreditBudget({ creditBudget: cap }, consumed, estimate),
      ).toThrow('credit budget');
    }
  });
  it('prevents a paid tool after earlier consumption reaches the cap', async () => {
    const executeTool = vi.fn();
    const prepareToolCall = vi.fn();
    const runner = new AgentTurnRoundRunnerService(
      {} as never,
      {} as never,
      { executeTool } as never,
      { prepareToolCall } as never,
      {} as never,
    );
    await expect(
      runner.executeToolRound({
        allowedToolNames: new Set(['generate_content']),
        assistantContent: '',
        context: { organizationId: 'org', userId: 'user', creditBudget: 5 },
        generationPriority: RouterPriority.BALANCED,
        messages: [],
        model: 'model',
        policy: {} as never,
        source: 'proactive',
        state: {
          artifactMetadata: [],
          highestRiskLevel: 'low',
          latestUiBlocks: null,
          reviewRequired: false,
          toolCalls: [],
          totalCreditsUsed: 5,
          uiActions: [],
        },
        threadId: 'thread',
        toolCalls: [
          {
            id: 'call',
            type: 'function',
            function: { name: 'generate_content', arguments: '{}' },
          },
        ],
      }),
    ).rejects.toThrow('credit budget');
    expect(executeTool).not.toHaveBeenCalled();
    expect(prepareToolCall).not.toHaveBeenCalled();
  });
});

describe('AgentTurnRoundRunnerService generate recovery', () => {
  const loggerService = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };
  const executeTool = vi.fn();
  const deductCredits = vi.fn();
  const cacheService = { get: vi.fn().mockResolvedValue(null) };
  const untrustedContentGateService = {
    evaluateToolResult: vi.fn(async ({ content }: { content: string }) => ({
      content,
      outcome: 'allowed' as const,
    })),
  };
  let runner: AgentTurnRoundRunnerService;

  beforeEach(() => {
    vi.clearAllMocks();
    executeTool.mockResolvedValue({
      creditsUsed: 0,
      nextActions: [{ id: 'card', type: 'content_preview_card' }],
      success: true,
    });
    runner = new AgentTurnRoundRunnerService(
      loggerService as never,
      {
        checkOrganizationCreditsAvailable: vi.fn().mockResolvedValue(true),
        deductCreditsFromOrganization: deductCredits,
      } as never,
      { executeTool } as never,
      new AgentToolConfirmationService(
        loggerService as never,
        cacheService as never,
      ),
      untrustedContentGateService as never,
    );
  });

  function round(params: {
    allowed: CuratedActionName[];
    args: Record<string, unknown>;
    generationMode?: AgentGenerationMode;
    name: string;
    state?: AgentToolRoundState;
  }) {
    return runner.executeToolRound({
      allowedToolNames: new Set(params.allowed),
      assistantContent: null,
      context: {
        ...(params.generationMode
          ? { generationMode: params.generationMode }
          : {}),
        organizationId: 'org-1',
        userId: 'user-1',
      },
      generationPriority: RouterPriority.BALANCED,
      messages: [{ content: 'Make it', role: 'user' }],
      model: 'test-model',
      policy: { organizationId: 'org-1' } as never,
      state: params.state ?? createState(),
      threadId: 'thread-1',
      toolCalls: [
        {
          function: {
            arguments: JSON.stringify(params.args),
            name: params.name,
          },
          id: 'tool-1',
          type: 'function',
        },
      ],
    });
  }

  it("hands a proactive run's configured targets to the tool executor", async () => {
    const agentBrief = { platforms: ['linkedin'], topics: ['craft'] };
    await runner.executeToolRound({
      allowedToolNames: new Set(['generate_turbo_content']),
      assistantContent: null,
      context: { agentBrief, organizationId: 'org-1', userId: 'user-1' },
      generationPriority: RouterPriority.BALANCED,
      messages: [{ content: 'Run the agent', role: 'user' }],
      model: 'test-model',
      policy: { organizationId: 'org-1' } as never,
      source: 'proactive',
      state: createState(),
      threadId: 'thread-1',
      toolCalls: [
        {
          function: {
            arguments: '{"count":3}',
            name: 'generate_turbo_content',
          },
          id: 'tool-1',
          type: 'function',
        },
      ],
    });
    expect(executeTool).toHaveBeenCalledOnce();
    expect(executeTool.mock.calls[0][2]).toMatchObject({
      agentBrief,
      isProactive: true,
    });
  });

  it('recovers a legacy per-kind name onto generate with the type and prompt filled from aliases', async () => {
    await round({
      allowed: ['generate'],
      args: {
        description: 'a red car',
        generationType: 'image',
        useIdentity: false,
      },
      name: 'generate_image',
    });

    expect(executeTool).toHaveBeenCalledOnce();
    const [toolName, toolParams] = executeTool.mock.calls[0];
    expect(toolName).toBe('generate');
    expect(toolParams).toEqual({ prompt: 'a red car', type: 'image' });
  });

  it('keeps an explicit prompt and fills one from text for legacy voice names', async () => {
    await round({
      allowed: ['generate'],
      args: { prompt: 'a blue bike', text: 'ignored' },
      name: 'default_api.generate_video',
    });
    await round({
      allowed: ['generate'],
      args: { text: 'Hello there', voiceId: 'voice-1' },
      name: 'generate_voice',
    });

    expect(executeTool.mock.calls[0][1]).toEqual({
      prompt: 'a blue bike',
      type: 'video',
    });
    expect(executeTool.mock.calls[1][1]).toEqual({
      prompt: 'Hello there',
      type: 'voice',
      voiceId: 'voice-1',
    });
  });

  it('drops fields the composer-selected type does not accept', async () => {
    await round({
      allowed: ['generate'],
      args: {
        aspectRatio: '9:16',
        outputs: 2,
        prompt: 'a red car',
        type: 'image',
      },
      generationMode: AgentGenerationMode.VIDEO,
      name: 'generate',
    });

    expect(executeTool).toHaveBeenCalledOnce();
    expect(executeTool.mock.calls[0][1]).toEqual({
      aspectRatio: '9:16',
      prompt: 'a red car',
      type: 'video',
    });
  });

  it('turns a visual generate call into a terminal accepted result', async () => {
    const image = await round({
      allowed: ['generate'],
      args: { prompt: 'a coast', type: 'image' },
      name: 'generate',
    });
    const video = await round({
      allowed: ['generate'],
      args: { prompt: 'a coast', type: 'video' },
      name: 'generate',
    });

    expect(image).toMatchObject({
      terminalContent: 'Image generation accepted.',
      terminalToolName: 'generate',
    });
    expect(video).toMatchObject({
      terminalContent: 'Video generation accepted.',
      terminalToolName: 'generate',
    });
  });

  it('does not end the turn after a voice or music generate call', async () => {
    const voice = await round({
      allowed: ['generate'],
      args: { prompt: 'Hello', type: 'voice' },
      name: 'generate',
    });
    const music = await round({
      allowed: ['generate'],
      args: { prompt: 'synthwave', type: 'music' },
      name: 'generate',
    });

    expect(voice).not.toHaveProperty('terminalToolName');
    expect(music).not.toHaveProperty('terminalToolName');
  });

  it('does not bill the catalog floor for a pending generation approval', async () => {
    executeTool.mockResolvedValueOnce({
      approvalStatus: 'pending',
      creditsUsed: 0,
      nextActions: [{ id: 'card', type: 'generation_action_card' }],
      requiresConfirmation: true,
      success: true,
    });
    const state = createState();
    await round({
      allowed: ['generate'],
      args: { prompt: 'A synthetic blue cube', type: 'video' },
      name: 'generate',
      state,
    });
    expect(state).toMatchObject({
      reviewRequired: true,
      totalCreditsUsed: 0,
      toolCalls: [{ creditsUsed: 0 }],
    });
    expect(deductCredits).not.toHaveBeenCalled();
  });

  it('does not charge a generic pending approval as completed paid work', async () => {
    executeTool.mockResolvedValueOnce({
      approvalId: 'approval-1',
      approvalStatus: 'pending',
      creditsUsed: 0,
      nextActions: [{ id: 'approval-1', type: 'mutation_approval_card' }],
      requiresConfirmation: true,
      success: true,
    });
    const state = createState();
    await round({
      allowed: ['generate_turbo_content'],
      args: { count: 14 },
      name: 'generate_turbo_content',
      state,
    });
    expect(state.totalCreditsUsed).toBe(0);
    expect(state.toolCalls[0]?.creditsUsed).toBe(0);
    expect(deductCredits).not.toHaveBeenCalled();
  });

  it('retains the actual delegated charge after completed generation', async () => {
    executeTool.mockResolvedValueOnce({
      creditsUsed: 17,
      isBillingDelegated: true,
      success: true,
    });
    const state = createState();
    await round({
      allowed: ['generate'],
      args: { prompt: 'A synthetic blue cube', type: 'video' },
      name: 'generate',
      state,
    });
    expect(state.totalCreditsUsed).toBe(17);
    expect(state.toolCalls[0]?.creditsUsed).toBe(17);
    expect(deductCredits).not.toHaveBeenCalled();
  });

  it('still settles completed catalog-billed work exactly once', async () => {
    executeTool.mockResolvedValueOnce({ success: true });
    const state = createState();
    await round({
      allowed: ['generate'],
      args: { prompt: 'A synthetic blue cube', type: 'video' },
      name: 'generate',
      state,
    });
    expect(deductCredits).toHaveBeenCalledTimes(1);
    expect(deductCredits.mock.calls[0]?.[2]).toBe(300);
    expect(state.totalCreditsUsed).toBe(300);
  });

  it('ends the turn when a mutation is waiting for approval', async () => {
    executeTool.mockResolvedValueOnce({
      approvalId: 'approval-1',
      approvalStatus: 'pending',
      creditsUsed: 0,
      nextActions: [
        { id: 'mutation-approval:approval-1', type: 'mutation_approval_card' },
      ],
      requiresConfirmation: true,
      success: true,
    });

    const result = await round({
      allowed: ['generate_turbo_content'],
      args: { count: 14 },
      name: 'generate_turbo_content',
    });

    expect(result).toMatchObject({
      terminalContent: 'Review the details and approve to continue.',
      terminalToolName: 'generate_turbo_content',
    });
  });
});

describe('AgentTurnRoundRunnerService tool credit holds', () => {
  const loggerService = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };
  const executeTool = vi.fn();
  const cacheService = { get: vi.fn().mockResolvedValue(null) };
  const untrustedContentGateService = {
    evaluateToolResult: vi.fn(async ({ content }: { content: string }) => ({
      content,
      outcome: 'allowed' as const,
    })),
  };

  /**
   * An in-memory ledger with the real wallet rules: a hold needs
   * `balance - held >= amount`, a settle spends the hold, a release returns it.
   * The affordability read ignores holds, as the real read-then-act check does.
   */
  function createLedger(balance: number) {
    const ledger = { balance, held: 0, nextId: 0 };
    const holds = new Map<string, number>();
    const credits = {
      checkOrganizationCreditsAvailable: vi.fn(
        async (_org: string, required: number) => ledger.balance >= required,
      ),
      deductCreditsFromOrganization: vi.fn(
        async (_org: string, _user: string, amount: number) => {
          ledger.balance -= amount;
        },
      ),
      releaseReservation: vi.fn(
        async ({ reservationId }: { reservationId: string }) => {
          const amount = holds.get(reservationId);
          if (amount === undefined) throw new Error('hold is not open');
          holds.delete(reservationId);
          ledger.held -= amount;
        },
      ),
      reserveCredits: vi.fn(async ({ amount }: { amount: number }) => {
        if (ledger.balance - ledger.held < amount) {
          throw new BusinessLogicException(
            'Insufficient organization credits',
            undefined,
            'INSUFFICIENT_CREDITS',
          );
        }
        ledger.nextId += 1;
        const id = `hold-${ledger.nextId}`;
        holds.set(id, amount);
        ledger.held += amount;
        return { amount, id };
      }),
      settleReservation: vi.fn(
        async ({
          actualAmount,
          reservationId,
        }: {
          actualAmount: number;
          reservationId: string;
        }) => {
          const amount = holds.get(reservationId);
          if (amount === undefined) throw new Error('hold is not open');
          holds.delete(reservationId);
          ledger.held -= amount;
          ledger.balance -= actualAmount;
        },
      ),
    };
    return { credits, ledger };
  }

  function createRunner(credits: unknown): AgentTurnRoundRunnerService {
    return new AgentTurnRoundRunnerService(
      loggerService as never,
      credits as never,
      { executeTool } as never,
      new AgentToolConfirmationService(
        loggerService as never,
        cacheService as never,
      ),
      untrustedContentGateService as never,
    );
  }

  function round(
    runner: AgentTurnRoundRunnerService,
    toolName: CuratedActionName,
    state: AgentToolRoundState = createState(),
  ) {
    return runner.executeToolRound({
      allowedToolNames: new Set([toolName]),
      assistantContent: null,
      context: { organizationId: 'org-1', userId: 'user-1' },
      generationPriority: RouterPriority.BALANCED,
      messages: [{ content: 'Schedule it', role: 'user' }],
      model: 'test-model',
      policy: { organizationId: 'org-1' } as never,
      state,
      threadId: 'thread-1',
      toolCalls: [
        {
          function: { arguments: '{}', name: toolName },
          id: 'tool-1',
          type: 'function',
        },
      ],
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts only one of two concurrent calls on a balance that pays for one', async () => {
    const { credits, ledger } = createLedger(1);
    let startedTools = 0;
    let releaseTools: () => void = () => undefined;
    const toolsMayFinish = new Promise<void>((resolve) => {
      releaseTools = resolve;
    });
    executeTool.mockImplementation(async () => {
      startedTools += 1;
      await toolsMayFinish;
      return { creditsUsed: 0, success: true };
    });
    const runner = createRunner(credits);
    const first = createState();
    const second = createState();

    const turns = Promise.all([
      round(runner, 'schedule_post', first),
      round(runner, 'schedule_post', second),
    ]);
    await vi.waitFor(() => {
      expect(
        startedTools +
          [first, second].filter((s) => s.toolCalls.length > 0).length,
      ).toBeGreaterThanOrEqual(2);
    });
    releaseTools();
    await turns;

    expect(startedTools).toBe(1);
    const refused = [first, second].filter(
      (state) => state.toolCalls[0]?.status === 'failed',
    );
    expect(refused).toHaveLength(1);
    expect(refused[0]?.toolCalls[0]?.error).toBe(
      'Insufficient credits (need 1)',
    );
    expect(refused[0]?.totalCreditsUsed).toBe(0);
    expect(ledger).toMatchObject({ balance: 0, held: 0 });
  });

  it('refuses a tool on a balance below its price before the tool runs', async () => {
    const { credits, ledger } = createLedger(0.5);
    executeTool.mockResolvedValue({ creditsUsed: 0, success: true });
    const state = createState();

    await round(createRunner(credits), 'schedule_post', state);

    expect(executeTool).not.toHaveBeenCalled();
    expect(state.toolCalls[0]).toMatchObject({
      creditsUsed: 0,
      status: 'failed',
    });
    expect(ledger).toMatchObject({ balance: 0.5, held: 0 });
  });

  it('charges a successful tool once and leaves no hold behind', async () => {
    const { credits, ledger } = createLedger(3);
    executeTool.mockResolvedValue({ creditsUsed: 0, success: true });
    const state = createState();

    await round(createRunner(credits), 'schedule_post', state);

    expect(ledger).toMatchObject({ balance: 2, held: 0 });
    expect(state.totalCreditsUsed).toBe(1);
    expect(state.toolCalls[0]).toMatchObject({
      creditsUsed: 1,
      status: 'completed',
    });
  });

  it('leaves no hold behind and charges nothing when the tool fails', async () => {
    const { credits, ledger } = createLedger(3);
    executeTool.mockResolvedValue({
      creditsUsed: 0,
      error: 'nope',
      success: false,
    });
    const state = createState();

    await round(createRunner(credits), 'schedule_post', state);

    expect(ledger).toMatchObject({ balance: 3, held: 0 });
    expect(state.totalCreditsUsed).toBe(0);
  });

  it('leaves no hold behind when the tool throws', async () => {
    const { credits, ledger } = createLedger(3);
    executeTool.mockRejectedValue(new Error('provider down'));

    await expect(round(createRunner(credits), 'schedule_post')).rejects.toThrow(
      'provider down',
    );

    expect(ledger).toMatchObject({ balance: 3, held: 0 });
  });

  it('leaves no hold behind and charges nothing for a pending approval', async () => {
    const { credits, ledger } = createLedger(3);
    executeTool.mockResolvedValue({
      approvalId: 'approval-1',
      approvalStatus: 'pending',
      creditsUsed: 0,
      requiresConfirmation: true,
      success: true,
    });
    const state = createState();

    await round(createRunner(credits), 'schedule_post', state);

    expect(ledger).toMatchObject({ balance: 3, held: 0 });
    expect(state.totalCreditsUsed).toBe(0);
  });

  it('holds nothing for a tool that bills itself, so its own hold is not doubled', async () => {
    const { credits, ledger } = createLedger(10);
    let heldWhileRunning = -1;
    executeTool.mockImplementation(async () => {
      heldWhileRunning = ledger.held;
      return { creditsUsed: 2, isBillingDelegated: true, success: true };
    });
    const state = createState();

    await round(createRunner(credits), 'generate_content', state);

    expect(heldWhileRunning).toBe(0);
    expect(state.totalCreditsUsed).toBe(2);
    expect(ledger).toMatchObject({ balance: 10, held: 0 });
  });
});
