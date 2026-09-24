import { AgentStrategiesService } from '@api/collections/agent-strategies/services/agent-strategies.service';
import { WorkflowExecutionsService } from '@api/collections/workflow-executions/services/workflow-executions.service';
import { Prisma, PrismaClient } from '@genfeedai/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.unmock('@genfeedai/prisma');
vi.unmock('@prisma/adapter-pg');

// Isolated migrated database seeded with fixtures/proactive-run-accounting.sql.
const connectionString = process.env.PROACTIVE_RUN_TEST_DATABASE_URL;
describe.skipIf(!connectionString)(
  'proactive terminal accounting PostgreSQL atomicity',
  () => {
    const prisma = connectionString
      ? new PrismaClient({
          adapter: new PrismaPg({ connectionString, max: 2 }),
        })
      : null;
    const logger = {
      log: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    const strategies = new AgentStrategiesService(
      prisma as never,
      logger as never,
    );
    const outbox = {
      recordWorkflowOutcome: vi.fn().mockResolvedValue(null),
      enqueueAfterCommit: vi.fn(),
    };
    const makeService = (
      strategyService: AgentStrategiesService = strategies,
    ) =>
      new WorkflowExecutionsService(
        prisma as never,
        logger as never,
        { emitExecutionOutcome: vi.fn() } as never,
        outbox as never,
        strategyService,
      );
    beforeEach(async () => {
      await prisma?.agentStrategy.update({
        where: { id: 'proactive-strategy-4961' },
        data: { config: {}, isActive: true, isDeleted: false },
      });
      await prisma?.workflowExecution.updateMany({
        where: { organizationId: 'proactive-org-4961' },
        data: {
          status: 'RUNNING',
          error: null,
          completedAt: null,
          failure: Prisma.DbNull,
          result: {
            metadata: {
              source: 'proactive',
              canonicalId: 'agent.turn.execute',
              strategyId: 'proactive-strategy-4961',
            },
          },
        },
      });
    });
    afterAll(async () => {
      await prisma?.$disconnect();
    });

    it('concurrent separate runs retain both exact totals and duplicate completion never recounts', async () => {
      const service = makeService();
      await Promise.all([
        service.completeExecution('proactive-run-1-4961'),
        service.completeExecution('proactive-run-2-4961'),
      ]);
      const row = await prisma?.agentStrategy.findUniqueOrThrow({
        where: { id: 'proactive-strategy-4961' },
      });
      expect(row?.config).toMatchObject({
        creditsUsedToday: 0.4,
        creditsUsedThisWeek: 0.4,
      });
      expect(
        ((row?.config ?? {}) as Record<string, unknown>).runHistory,
      ).toHaveLength(2);
      const execution = await prisma?.workflowExecution.findUniqueOrThrow({
        where: { id: 'proactive-run-1-4961' },
      });
      expect(execution?.result).toMatchObject({
        metadata: { proactiveCreditsUsed: 0.27 },
      });
      await prisma?.agentStrategy.update({
        where: { id: 'proactive-strategy-4961' },
        data: {
          config: {
            ...(row?.config as Record<string, Prisma.InputJsonValue>),
            runHistory: [],
          },
        },
      });
      expect(
        await service.completeExecution('proactive-run-1-4961'),
      ).toBeNull();
      const after = await prisma?.agentStrategy.findUniqueOrThrow({
        where: { id: 'proactive-strategy-4961' },
      });
      expect(after?.config).toMatchObject({
        creditsUsedToday: 0.4,
        runHistory: [],
      });
    });
    it('simultaneous duplicate completions record exactly once', async () => {
      const service = makeService();
      const results = await Promise.all([
        service.completeExecution('proactive-run-1-4961'),
        service.completeExecution('proactive-run-1-4961'),
      ]);
      expect(results.filter(Boolean)).toHaveLength(1);
      expect(
        (
          await prisma?.agentStrategy.findUniqueOrThrow({
            where: { id: 'proactive-strategy-4961' },
          })
        )?.config,
      ).toMatchObject({ creditsUsedToday: 0.27 });
    });
    it('failure records only consumed credits, including a zero-charge failure', async () => {
      const service = makeService();
      await service.completeExecution(
        'proactive-run-1-4961',
        'generation failed',
      );
      await service.completeExecution(
        'proactive-run-3-4961',
        'before generation',
      );
      const row = await prisma?.agentStrategy.findUniqueOrThrow({
        where: { id: 'proactive-strategy-4961' },
      });
      expect(row?.config).toMatchObject({
        creditsUsedToday: 0.27,
        consecutiveFailures: 2,
      });
      expect(
        ((row?.config ?? {}) as Record<string, unknown>).runHistory,
      ).toHaveLength(2);
    });
    it('recording errors roll back the terminal claim for retry', async () => {
      const service = makeService({
        recordRun: vi.fn().mockRejectedValue(new Error('record write failed')),
      } as never);
      await expect(
        service.completeExecution('proactive-run-1-4961'),
      ).rejects.toThrow();
      expect(
        (
          await prisma?.workflowExecution.findUniqueOrThrow({
            where: { id: 'proactive-run-1-4961' },
          })
        )?.status,
      ).toBe('RUNNING');
      expect(
        (
          await prisma?.agentStrategy.findUniqueOrThrow({
            where: { id: 'proactive-strategy-4961' },
          })
        )?.config,
      ).toEqual({});
    });
  },
);
