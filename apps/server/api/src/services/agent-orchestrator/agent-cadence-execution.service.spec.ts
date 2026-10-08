import type { CadenceDraftGenerator } from '@api/collections/agent-strategies/services/agent-strategy-autopilot.types';
import { currentWorkflowAccountingScope } from '@api/collections/workflow-executions/services/workflow-accounting.context';
import { AgentCadenceExecutionService } from '@api/services/agent-orchestrator/agent-cadence-execution.service';
import type { PreparedAgentTurnState } from '@api/services/agent-orchestrator/agent-turn-workflow-execution.service';
import {
  AgentStrategyRunStatus,
  TargetExecutionState,
} from '@genfeedai/contracts';
import { GENERATE_CONTENT_TEXT_CREDITS } from '@genfeedai/contracts/constants';
import { describe, expect, it, vi } from 'vitest';

const state: PreparedAgentTurnState = {
  executionId: 'execution',
  organizationId: 'organization',
  userId: 'user',
  strategyId: 'strategy',
  threadId: 'thread',
  request: {
    source: 'proactive',
    brandId: 'brand',
    threadId: 'thread',
    content: 'Replenish',
    creditBudget: 10,
  },
};
function setup() {
  const strategy = {
    id: 'strategy',
    organizationId: 'organization',
    userId: 'user',
    brandId: 'brand',
    isActive: true,
    isEnabled: true,
    postsPerWeek: 7,
    publishingCeilingPerWeek: 14,
    readyDraftReserve: 3,
    runHistory: [],
  };
  const strategies = {
    findOneById: vi.fn().mockResolvedValue(strategy),
    recordRun: vi.fn(),
  };
  const autopilot = {
    executeQueuedRun: vi.fn().mockResolvedValue({ summary: 'Replenished' }),
  };
  const text = {
    generateContent: vi.fn().mockResolvedValue({
      success: true,
      creditsUsed: GENERATE_CONTENT_TEXT_CREDITS,
      data: { content: 'Useful content' },
    }),
  };
  const posts = { create: vi.fn().mockResolvedValue({ id: 'draft' }) };
  const optimizers = {
    analyzeContent: vi
      .fn()
      .mockImplementation(async (_params, _org, _user, onBilling) => {
        onBilling(1);
        return { overallScore: 90 };
      }),
  };
  const credits = {
    getOrganizationCreditsBalance: vi.fn().mockResolvedValue(20),
    deductCreditsFromOrganization: vi.fn().mockResolvedValue(undefined),
  };
  const service = Reflect.construct(AgentCadenceExecutionService, [
    strategies,
    autopilot,
    text,
    posts,
    optimizers,
    credits,
  ]) as AgentCadenceExecutionService;
  const input = {
    creditBudget: 10,
    format: 'text',
    platform: 'twitter',
    strategy,
    userId: 'user',
    opportunity: { id: 'opportunity', topic: 'Topic' },
  } as unknown as Parameters<CadenceDraftGenerator>[0];
  return {
    service,
    strategy,
    strategies,
    autopilot,
    text,
    posts,
    input,
    optimizers,
    credits,
  };
}
describe('active cadence workflow execution', () => {
  it.each([false, true])(
    'accounts for quality charges even when scoring fails (%s)',
    async (fails) => {
      const s = setup();
      if (fails)
        s.optimizers.analyzeContent.mockImplementation(
          async (_params, _org, _user, onBilling) => {
            onBilling(1);
            throw new Error('Invalid quality response');
          },
        );
      s.autopilot.executeQueuedRun.mockImplementation(
        async ({ draftGenerator }) => {
          const generated = await draftGenerator(s.input);
          expect(currentWorkflowAccountingScope()?.workflowExecutionId).toBe(
            state.executionId,
          );
          await generated.evaluateQuality();
          return { summary: 'Evaluated' };
        },
      );
      if (fails)
        await expect(s.service.tryExecute(state)).rejects.toThrow(
          'Invalid quality response',
        );
      else
        expect((await s.service.tryExecute(state))?.creditsUsed).toBe(
          GENERATE_CONTENT_TEXT_CREDITS + 1,
        );
      expect(s.credits.deductCreditsFromOrganization).toHaveBeenCalledOnce();
      expect(s.optimizers.analyzeContent).toHaveBeenCalledWith(
        expect.any(Object),
        state.organizationId,
        state.userId,
        expect.any(Function),
        10 - GENERATE_CONTENT_TEXT_CREDITS,
      );
      expect(s.strategies.recordRun).toHaveBeenCalledWith(
        'strategy',
        expect.objectContaining({
          creditsUsed: GENERATE_CONTENT_TEXT_CREDITS + 1,
        }),
        'organization',
      );
    },
  );
  it('bills the existing text path once and records actual persisted drafts', async () => {
    const s = setup();
    s.autopilot.executeQueuedRun.mockImplementation(
      async ({ draftGenerator }) => {
        await draftGenerator(s.input);
        return { summary: 'Replenished' };
      },
    );
    expect((await s.service.tryExecute(state))?.creditsUsed).toBe(
      GENERATE_CONTENT_TEXT_CREDITS,
    );
    expect(s.text.generateContent).toHaveBeenCalledOnce();
    expect(s.posts.create).toHaveBeenCalledWith(
      expect.objectContaining({
        agentStrategyId: 'strategy',
        organizationId: 'organization',
        sourceActionId: 'opportunity',
        workflowExecutionId: state.executionId,
        targetExecutionState: TargetExecutionState.DRAFT,
      }),
    );
    expect(s.strategies.recordRun).toHaveBeenCalledWith(
      'strategy',
      expect.objectContaining({
        contentGenerated: 1,
        creditsUsed: GENERATE_CONTENT_TEXT_CREDITS,
        status: AgentStrategyRunStatus.COMPLETED,
      }),
      'organization',
    );
  });
  it('retains paid usage when draft persistence fails and aborts the run', async () => {
    const s = setup();
    s.posts.create.mockRejectedValue(new Error('Persistence failed'));
    s.autopilot.executeQueuedRun.mockImplementation(
      async ({ draftGenerator }) => draftGenerator(s.input),
    );
    await expect(s.service.tryExecute(state)).rejects.toThrow(
      'Persistence failed',
    );
    expect(s.strategies.recordRun).toHaveBeenCalledWith(
      'strategy',
      expect.objectContaining({
        contentGenerated: 0,
        creditsUsed: GENERATE_CONTENT_TEXT_CREDITS,
        status: AgentStrategyRunStatus.FAILED,
      }),
      'organization',
    );
  });
  it.each([{ format: 'image' }, { platform: 'unsupported' }])(
    'holds unsupported work without paid dispatch (%j)',
    async (change) => {
      const s = setup();
      s.autopilot.executeQueuedRun.mockImplementation(
        async ({ draftGenerator }) => draftGenerator({ ...s.input, ...change }),
      );
      await expect(s.service.tryExecute(state)).rejects.toThrow();
      expect(s.text.generateContent).not.toHaveBeenCalled();
      expect(s.posts.create).not.toHaveBeenCalled();
    },
  );
  it('does not dispatch below the authoritative text cost', async () => {
    const s = setup();
    s.autopilot.executeQueuedRun.mockImplementation(
      async ({ draftGenerator }) => {
        await draftGenerator({
          ...s.input,
          creditBudget: GENERATE_CONTENT_TEXT_CREDITS - 1,
        });
        return { summary: 'Held' };
      },
    );
    await s.service.tryExecute(state);
    expect(s.text.generateContent).not.toHaveBeenCalled();
  });
  it('preserves legacy turns and prevents foreign-scope or recorded execution dispatch', async () => {
    const s = setup();
    s.strategies.findOneById.mockResolvedValueOnce({
      ...s.strategy,
      publishingCeilingPerWeek: undefined,
      readyDraftReserve: undefined,
    });
    expect(await s.service.tryExecute(state)).toBeNull();
    s.strategies.findOneById.mockResolvedValueOnce({
      ...s.strategy,
      brandId: 'other-brand',
    });
    await expect(s.service.tryExecute(state)).rejects.toThrow('authorized');
    s.strategies.findOneById.mockResolvedValueOnce({
      ...s.strategy,
      runHistory: [{ executionId: state.executionId }],
    });
    await s.service.tryExecute(state);
    expect(s.autopilot.executeQueuedRun).not.toHaveBeenCalled();
  });
});
