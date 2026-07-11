import type { AgentGoalsService } from '@api/collections/agent-goals/services/agent-goals.service';
import type { AgentMemoryCaptureService } from '@api/collections/agent-memories/services/agent-memory-capture.service';
import { AgentMemoryGoalsToolHandler } from '@api/services/agent-orchestrator/tools/agent-memory-goals-tool-handler.service';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';

const ctx: ToolExecutionContext = {
  organizationId: '67a123456789012345678901',
  userId: '67a123456789012345678902',
};

describe('AgentMemoryGoalsToolHandler', () => {
  let agentMemoryCaptureService: {
    capture: ReturnType<typeof vi.fn>;
  };
  let agentGoalsService: {
    create: ReturnType<typeof vi.fn>;
    refreshProgress: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  let handlerWithServices: AgentMemoryGoalsToolHandler;
  let handlerWithoutServices: AgentMemoryGoalsToolHandler;

  beforeEach(() => {
    agentMemoryCaptureService = {
      capture: vi.fn().mockResolvedValue({
        memory: {
          id: 'memory-1',
          content: 'Write concise newsletters with a strong hook.',
          contentType: 'newsletter',
          kind: 'preference',
          scope: 'user',
          summary: 'Concise newsletter hook preference',
        },
        wroteBrandInsight: false,
        wroteContextMemory: true,
      }),
    };
    agentGoalsService = {
      create: vi.fn().mockResolvedValue({
        currentValue: 250,
        id: 'goal-1',
        label: 'Grow views',
        metric: 'views',
        progressPercent: 25,
        targetValue: 1000,
      }),
      refreshProgress: vi.fn().mockResolvedValue({
        currentValue: 250,
        id: 'goal-1',
        label: 'Grow views',
        metric: 'views',
        progressPercent: 25,
        targetValue: 1000,
      }),
      update: vi.fn().mockResolvedValue({
        currentValue: 400,
        id: 'goal-1',
        label: 'Grow views',
        metric: 'views',
        progressPercent: 40,
        targetValue: 1000,
      }),
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
          brandId: '67a123456789012345678903',
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

      expect(agentMemoryCaptureService.capture).toHaveBeenCalled();
      expect(result).toEqual(
        expect.objectContaining({
          creditsUsed: 0,
          data: expect.objectContaining({
            contentType: 'newsletter',
            destinations: ['agent memory', 'content memory'],
            id: 'memory-1',
            kind: 'preference',
            scope: 'user',
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
      expect(agentMemoryCaptureService.capture).not.toHaveBeenCalled();
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

      expect(agentGoalsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          label: 'Grow views',
          metric: 'views',
          targetValue: 1000,
        }),
        ctx.organizationId,
        ctx.userId,
      );
      expect(result).toEqual(
        expect.objectContaining({
          creditsUsed: 0,
          data: expect.objectContaining({
            goalId: 'goal-1',
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
      expect(agentGoalsService.create).not.toHaveBeenCalled();
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
        { goalId: '67a123456789012345678903' },
        ctx,
      );

      expect(agentGoalsService.refreshProgress).toHaveBeenCalledWith(
        '67a123456789012345678903',
        ctx.organizationId,
      );
      expect(result).toEqual(
        expect.objectContaining({
          creditsUsed: 0,
          data: expect.objectContaining({
            goalId: 'goal-1',
            progressPercent: 25,
          }),
          success: true,
        }),
      );
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
      expect(agentGoalsService.refreshProgress).not.toHaveBeenCalled();
    });

    it('fails when the agent goals service is unavailable', async () => {
      const result = await handlerWithoutServices.checkGoalProgress(
        { goalId: '67a123456789012345678903' },
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
        { goalId: '67a123456789012345678903', targetValue: 1000 },
        ctx,
      );

      expect(agentGoalsService.update).toHaveBeenCalledWith(
        '67a123456789012345678903',
        expect.objectContaining({ targetValue: 1000 }),
        ctx.organizationId,
      );
      expect(result).toEqual(
        expect.objectContaining({
          creditsUsed: 0,
          data: expect.objectContaining({
            goalId: 'goal-1',
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
      expect(agentGoalsService.update).not.toHaveBeenCalled();
    });

    it('fails when the agent goals service is unavailable', async () => {
      const result = await handlerWithoutServices.updateGoal(
        { goalId: '67a123456789012345678903', targetValue: 1000 },
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
