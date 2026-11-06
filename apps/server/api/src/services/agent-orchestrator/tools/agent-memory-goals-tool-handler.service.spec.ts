import type { AgentGoalsService } from '@api/collections/agent-goals/services/agent-goals.service';
import type { AgentMemoryCaptureService } from '@api/collections/agent-memories/services/agent-memory-capture.service';
import { AgentMemoryGoalsToolHandler } from '@api/services/agent-orchestrator/tools/agent-memory-goals-tool-handler.service';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { testId } from '@helpers/testing/test-id.helper';

const initiatingPrincipal = {
  organizationId: testId('org'),
  userId: testId('user'),
  isApiKey: false,
  scopes: [],
};
const ctx: ToolExecutionContext = {
  initiatingPrincipal,
  organizationId: testId('org'),
  userId: testId('user'),
};
const goalId = testId('goal');

type Capture = {
  input: Record<string, unknown>;
  organizationId: string;
  provenance: unknown;
  userId: string;
};
type Goal = {
  currentValue: number;
  id: string;
  label: string;
  metric: string;
  organizationId: string;
  progressPercent: number;
  targetValue: number;
};

describe('AgentMemoryGoalsToolHandler', () => {
  let captures: Capture[];
  let goals: Goal[];
  let handlerWithServices: AgentMemoryGoalsToolHandler;
  let handlerWithoutServices: AgentMemoryGoalsToolHandler;

  beforeEach(() => {
    captures = [];
    goals = [
      {
        currentValue: 250,
        id: goalId,
        label: 'Grow views',
        metric: 'views',
        organizationId: ctx.organizationId,
        progressPercent: 0,
        targetValue: 1000,
      },
    ];
    const agentMemoryCaptureService = {
      capture: async (
        userId: string,
        organizationId: string,
        input: Record<string, unknown>,
        provenance: unknown,
      ) => {
        captures.push({ input, organizationId, provenance, userId });
        return {
          memory: {
            content: input.content,
            contentType: input.contentType,
            id: `memory-${captures.length}`,
            kind: input.kind,
            scope: input.scope,
            summary: input.summary,
          },
          wroteBrandInsight: false,
          wroteContextMemory: input.saveToContextMemory === true,
        };
      },
    };
    const progressOf = (goal: Goal) =>
      Object.assign(goal, {
        progressPercent: Math.round(
          (goal.currentValue / goal.targetValue) * 100,
        ),
      });
    const ownGoal = (id: string, organizationId: string) => {
      const goal = goals.find(
        (item) => item.id === id && item.organizationId === organizationId,
      );
      if (!goal) throw new Error(`Goal ${id} not found`);
      return goal;
    };
    const agentGoalsService = {
      create: async (
        dto: { label: string; metric: string; targetValue: number },
        organizationId: string,
      ) => {
        const goal = progressOf({
          currentValue: 250,
          id: `goal-${goals.length + 1}`,
          label: dto.label,
          metric: dto.metric,
          organizationId,
          progressPercent: 0,
          targetValue: dto.targetValue,
        });
        goals.push(goal);
        return goal;
      },
      refreshProgress: async (id: string, organizationId: string) =>
        progressOf(ownGoal(id, organizationId)),
      update: async (
        id: string,
        dto: Partial<Pick<Goal, 'label' | 'targetValue'>>,
        organizationId: string,
      ) => progressOf(Object.assign(ownGoal(id, organizationId), dto)),
    };

    handlerWithServices = new AgentMemoryGoalsToolHandler(
      agentMemoryCaptureService as unknown as AgentMemoryCaptureService,
      agentGoalsService as unknown as AgentGoalsService,
    );
    handlerWithoutServices = new AgentMemoryGoalsToolHandler(
      undefined as unknown as AgentMemoryCaptureService,
      undefined as unknown as AgentGoalsService,
    );
  });

  describe('captureMemory', () => {
    it('captures memory and reports routed destinations', async () => {
      const result = await handlerWithServices.captureMemory(
        {
          brandId: testId('brand'),
          content: 'Use short, curiosity-driven newsletter openings.',
          contentType: 'newsletter',
          kind: 'winner',
          saveToContextMemory: true,
          scope: 'brand',
          summary: 'Short curiosity-driven newsletter openings',
          tags: ['newsletter', 'hook'],
        },
        ctx,
      );

      expect(captures).toEqual([
        expect.objectContaining({
          input: expect.objectContaining({
            content: 'Use short, curiosity-driven newsletter openings.',
            scope: 'brand',
          }),
          organizationId: ctx.organizationId,
          userId: ctx.userId,
        }),
      ]);
      expect(result).toEqual(
        expect.objectContaining({
          creditsUsed: 0,
          data: expect.objectContaining({
            contentType: 'newsletter',
            destinations: ['agent memory', 'content memory'],
            id: 'memory-1',
            kind: 'winner',
            scope: 'brand',
          }),
          success: true,
        }),
      );
    });

    it('fails when content is missing', async () => {
      const result = await handlerWithServices.captureMemory({}, ctx);

      expect(result).toEqual({
        creditsUsed: 0,
        error: 'Memory capture requires content.',
        success: false,
      });
      expect(captures).toEqual([]);
    });

    it('maps legacy user and campaign scopes onto personal and brand', async () => {
      await handlerWithServices.captureMemory(
        { content: 'Keep my personal voice.', scope: 'user' },
        ctx,
      );
      await handlerWithServices.captureMemory(
        {
          brandId: testId('brand'),
          content: 'Campaign winner.',
          scope: 'campaign',
        },
        ctx,
      );

      expect(
        captures.map(({ input, provenance }) => [input.scope, provenance]),
      ).toEqual([
        ['personal', { origin: 'ACTOR', actor: initiatingPrincipal }],
        ['brand', { origin: 'ACTOR', actor: initiatingPrincipal }],
      ]);
    });

    it.each([undefined, false])(
      'denies absent interactive authority with proactive marker %s before effects',
      async (isProactive) => {
        const result = await handlerWithServices.captureMemory(
          { content: 'Private', isProactive: true, initiatingPrincipal },
          { ...ctx, initiatingPrincipal: undefined, isProactive },
        );
        expect(result).toMatchObject({ success: false, creditsUsed: 0 });
        expect(captures).toEqual([]);
      },
    );
    it('admits genuinely actorless server-marked proactive capture as derived authority', async () => {
      await handlerWithServices.captureMemory(
        { content: 'Background', sourceContentId: 'forged-source' },
        { ...ctx, initiatingPrincipal: undefined, isProactive: true },
      );
      expect(captures).toEqual([
        expect.objectContaining({
          input: expect.objectContaining({ content: 'Background' }),
          provenance: { origin: 'DERIVED_MEMORY' },
          userId: ctx.userId,
        }),
      ]);
    });
    it('retains an actual captured actor on proactive-marked work', async () => {
      await handlerWithServices.captureMemory(
        { content: 'Interactive' },
        { ...ctx, isProactive: true },
      );
      expect(captures.map((capture) => capture.provenance)).toEqual([
        { origin: 'ACTOR', actor: initiatingPrincipal },
      ]);
    });
    it('uses trusted approving identity separately from requester memory ownership', async () => {
      const approving = {
        ...initiatingPrincipal,
        userId: 'actual-approver',
        isApiKey: true,
        apiKeyId: 'approver-key',
        scopes: ['memory:write'],
      };
      await handlerWithServices.captureMemory(
        { content: 'Approved' },
        {
          ...ctx,
          approvedApprovalId: 'exact-approval',
          initiatingPrincipal: undefined,
          scheduleAuthorityPrincipal: approving,
        },
      );
      expect(captures).toEqual([
        expect.objectContaining({
          provenance: { origin: 'ACTOR', actor: approving },
          userId: ctx.userId,
        }),
      ]);
    });
    it('never downgrades a present cross-tenant actor into proactive derived authority', async () => {
      const result = await handlerWithServices.captureMemory(
        { content: 'Private' },
        {
          ...ctx,
          isProactive: true,
          initiatingPrincipal: {
            ...initiatingPrincipal,
            organizationId: 'other-org',
          },
        },
      );
      expect(result).toMatchObject({ success: false });
      expect(captures).toEqual([]);
    });
    it('denies approval redemption without its actual approving principal even when proactive', async () => {
      const result = await handlerWithServices.captureMemory(
        { content: 'Private' },
        {
          ...ctx,
          approvedApprovalId: 'exact-approval',
          initiatingPrincipal: undefined,
          isProactive: true,
        },
      );
      expect(result).toMatchObject({ success: false });
      expect(captures).toEqual([]);
    });

    it('fails when the memory capture service is unavailable', async () => {
      const result = await handlerWithoutServices.captureMemory(
        { content: 'Use short, curiosity-driven newsletter openings.' },
        ctx,
      );

      expect(result).toEqual({
        creditsUsed: 0,
        error: 'Memory capture is not available in this environment.',
        success: false,
      });
    });
  });

  describe('createGoal', () => {
    it('creates a goal via the agent goals service', async () => {
      const result = await handlerWithServices.createGoal(
        {
          label: 'Grow views',
          metric: 'views',
          targetValue: 1000,
        },
        ctx,
      );

      expect(goals.at(-1)).toMatchObject({
        id: 'goal-2',
        label: 'Grow views',
        metric: 'views',
        organizationId: ctx.organizationId,
        targetValue: 1000,
      });
      expect(result).toEqual(
        expect.objectContaining({
          creditsUsed: 0,
          data: expect.objectContaining({
            goalId: 'goal-2',
            progressPercent: 25,
          }),
          success: true,
        }),
      );
    });

    it('fails when label, metric, or targetValue are invalid', async () => {
      const result = await handlerWithServices.createGoal(
        { label: 'Grow views' },
        ctx,
      );

      expect(result).toEqual({
        creditsUsed: 0,
        error: 'create_goal requires label, metric, and numeric targetValue.',
        success: false,
      });
      expect(goals).toHaveLength(1);
    });

    it('fails when the agent goals service is unavailable', async () => {
      const result = await handlerWithoutServices.createGoal(
        { label: 'Grow views', metric: 'views', targetValue: 1000 },
        ctx,
      );

      expect(result).toEqual({
        creditsUsed: 0,
        error: 'Agent goals are not available in this environment.',
        success: false,
      });
    });
  });

  describe('checkGoalProgress', () => {
    it('refreshes and returns goal progress', async () => {
      const result = await handlerWithServices.checkGoalProgress(
        { goalId },
        ctx,
      );

      expect(result).toEqual(
        expect.objectContaining({
          creditsUsed: 0,
          data: expect.objectContaining({
            goalId,
            progressPercent: 25,
          }),
          success: true,
        }),
      );
      expect(goals[0].progressPercent).toBe(25);
    });

    it('rejects an invalid goalId', async () => {
      const result = await handlerWithServices.checkGoalProgress(
        { goalId: 'not-an-object-id' },
        ctx,
      );

      expect(result).toEqual({
        creditsUsed: 0,
        error: 'check_goal_progress requires a valid goalId.',
        success: false,
      });
      expect(goals[0].progressPercent).toBe(0);
    });

    it('fails when the agent goals service is unavailable', async () => {
      const result = await handlerWithoutServices.checkGoalProgress(
        { goalId },
        ctx,
      );

      expect(result).toEqual({
        creditsUsed: 0,
        error: 'Agent goals are not available in this environment.',
        success: false,
      });
    });
  });

  describe('updateGoal', () => {
    it('updates a goal via the agent goals service', async () => {
      const result = await handlerWithServices.updateGoal(
        { goalId, targetValue: 625 },
        ctx,
      );

      expect(goals[0]).toMatchObject({ targetValue: 625 });
      expect(result).toEqual(
        expect.objectContaining({
          creditsUsed: 0,
          data: expect.objectContaining({
            goalId,
            progressPercent: 40,
          }),
          success: true,
        }),
      );
    });

    it('rejects an invalid goalId', async () => {
      const result = await handlerWithServices.updateGoal(
        { goalId: 'not-an-object-id', targetValue: 1000 },
        ctx,
      );

      expect(result).toEqual({
        creditsUsed: 0,
        error: 'update_goal requires a valid goalId.',
        success: false,
      });
      expect(goals[0].targetValue).toBe(1000);
    });

    it('fails when the agent goals service is unavailable', async () => {
      const result = await handlerWithoutServices.updateGoal(
        { goalId, targetValue: 1000 },
        ctx,
      );

      expect(result).toEqual({
        creditsUsed: 0,
        error: 'Agent goals are not available in this environment.',
        success: false,
      });
    });
  });
});
