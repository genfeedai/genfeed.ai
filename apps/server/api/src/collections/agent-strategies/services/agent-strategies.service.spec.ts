vi.unmock('@genfeedai/prisma');

import type { AgentStrategyDocument } from '@api/collections/agent-strategies/schemas/agent-strategy.schema';
import { AgentStrategiesService } from '@api/collections/agent-strategies/services/agent-strategies.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { AgentType } from '@genfeedai/contracts';
import type { LoggerService } from '@libs/logger/logger.service';

describe('AgentStrategiesService', () => {
  let service: AgentStrategiesService;
  let findOneByIdSpy: ReturnType<typeof vi.spyOn>;
  let patchSpy: ReturnType<typeof vi.spyOn>;

  function makeStrategy(isActive: boolean): AgentStrategyDocument {
    return {
      id: 'strategy-1',
      isActive,
      organizationId: 'org-1',
    } as unknown as AgentStrategyDocument;
  }

  beforeEach(() => {
    service = new AgentStrategiesService(
      {} as unknown as PrismaService,
      {
        debug: vi.fn(),
        error: vi.fn(),
        log: vi.fn(),
        warn: vi.fn(),
      } as unknown as LoggerService,
    );

    patchSpy = vi
      .spyOn(service, 'patch')
      .mockImplementation(async (_id, data) => data as AgentStrategyDocument);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('normalizes required arrays for legacy rows with sparse config', async () => {
    const create = vi.fn().mockResolvedValue({
      config: {},
      id: 'strategy-1',
      policies: {},
      platforms: [],
    });

    const strategy = await service.createWithClient(
      {
        label: 'Legacy strategy',
        organizationId: 'org-1',
        userId: 'user-1',
      },
      { agentStrategy: { create } } as never,
    );

    expect(strategy).toMatchObject({
      platforms: [],
      runHistory: [],
      skillSlugs: [],
      topics: [],
      workflowInputOverrides: [],
    });
  });

  it('queues the next run and clears failure state when activating', async () => {
    findOneByIdSpy = vi
      .spyOn(service, 'findOneById')
      .mockResolvedValue(makeStrategy(false));

    await service.setActive('strategy-1', 'org-1', true);

    expect(findOneByIdSpy).toHaveBeenCalledWith('strategy-1', 'org-1');
    expect(patchSpy).toHaveBeenCalledWith('strategy-1', {
      consecutiveFailures: 0,
      isActive: true,
      nextRunAt: expect.any(Date),
      requiresManualReactivation: false,
    });
  });

  it('clears the schedule when deactivating', async () => {
    vi.spyOn(service, 'findOneById').mockResolvedValue(makeStrategy(true));

    await service.setActive('strategy-1', 'org-1', false);

    expect(patchSpy).toHaveBeenCalledWith('strategy-1', {
      isActive: false,
      nextRunAt: null,
    });
  });

  it('does not reset derived fields when the active state is unchanged', async () => {
    vi.spyOn(service, 'findOneById').mockResolvedValue(makeStrategy(true));

    await service.setActive('strategy-1', 'org-1', true);

    expect(patchSpy).toHaveBeenCalledWith('strategy-1', { isActive: true });
  });

  it('returns null and does not patch when the strategy is missing', async () => {
    vi.spyOn(service, 'findOneById').mockResolvedValue(null);

    const result = await service.setActive('missing', 'org-1', true);

    expect(result).toBeNull();
    expect(patchSpy).not.toHaveBeenCalled();
  });

  it('creates through the supplied transaction with canonical workflow defaults', async () => {
    const create = vi.fn().mockResolvedValue({
      config: { skillSlugs: ['content-writing', 'image-generation'] },
      id: 'strategy-1',
      policies: {},
    });

    await service.createWithClient(
      {
        agentType: AgentType.VIDEO_CREATOR,
        brandId: 'brand-1',
        isActive: false,
        label: 'Short Creator',
        organizationId: 'org-1',
        userId: 'user-1',
      },
      { agentStrategy: { create } } as never,
    );

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        brandId: 'brand-1',
        config: expect.objectContaining({
          skillSlugs: ['content-writing', 'image-generation'],
        }),
        isActive: false,
        organizationId: 'org-1',
        preferredWorkflowTemplateId: 'social-media-video-series',
        userId: 'user-1',
      }),
    });
    expect(create.mock.calls[0]?.[0].data.config).not.toHaveProperty(
      'nextRunAt',
    );
  });

  it('preserves an explicit empty skill list to inherit brand defaults', async () => {
    const create = vi.fn().mockResolvedValue({
      config: { skillSlugs: [] },
      id: 'strategy-1',
      policies: {},
    });

    await service.createWithClient(
      {
        agentType: AgentType.VIDEO_CREATOR,
        brandId: 'brand-1',
        isActive: false,
        label: 'Short Creator',
        organizationId: 'org-1',
        skillSlugs: [],
        userId: 'user-1',
      },
      { agentStrategy: { create } } as never,
    );

    expect(create.mock.calls[0]?.[0].data.config).toMatchObject({
      skillSlugs: [],
    });
  });

  it('preserves an explicit nonempty skill override', async () => {
    const create = vi.fn().mockResolvedValue({
      config: { skillSlugs: ['brand-voice'] },
      id: 'strategy-1',
      policies: {},
    });

    await service.createWithClient(
      {
        agentType: AgentType.VIDEO_CREATOR,
        brandId: 'brand-1',
        isActive: false,
        label: 'Short Creator',
        organizationId: 'org-1',
        skillSlugs: ['brand-voice'],
        userId: 'user-1',
      },
      { agentStrategy: { create } } as never,
    );

    expect(create.mock.calls[0]?.[0].data.config).toMatchObject({
      skillSlugs: ['brand-voice'],
    });
  });
});

describe('AgentStrategiesService budget and atomic run persistence', () => {
  function setup(config: Record<string, unknown> = {}) {
    const row = {
      id: 'strategy',
      organizationId: 'org',
      config,
      policies: {},
      isDeleted: false,
      isActive: true,
    };
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn(prisma),
      ),
      agentStrategy: {
        findFirst: vi
          .fn()
          .mockImplementation(async ({ where }) =>
            where.organizationId && where.organizationId !== 'org' ? null : row,
          ),
        create: vi
          .fn()
          .mockImplementation(async ({ data }) => ({ ...row, ...data })),
        update: vi
          .fn()
          .mockImplementation(async ({ data }) => Object.assign(row, data)),
      },
    };
    const service = new AgentStrategiesService(
      prisma as never,
      { debug: vi.fn(), error: vi.fn() } as never,
    );
    return { prisma, service, row };
  }
  it.each([
    [10, undefined, 50],
    [10, 0, 0],
    [undefined, undefined, 0],
  ])(
    'defaults weekly budgets from daily without overriding zero',
    async (daily, weekly, expected) => {
      const { prisma, service } = setup();
      await service.createWithClient(
        {
          organizationId: 'org',
          userId: 'user',
          label: 'Agent',
          dailyCreditBudget: daily,
          weeklyCreditBudget: weekly,
        },
        prisma as never,
      );
      expect(prisma.agentStrategy.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            config: expect.objectContaining({ weeklyCreditBudget: expected }),
          }),
        }),
      );
    },
  );
  it.each([
    [
      { dailyCreditBudget: 10, weeklyCreditBudget: 12 },
      { label: 'changed' },
      12,
    ],
    [{ dailyCreditBudget: 10, weeklyCreditBudget: 0 }, { label: 'changed' }, 0],
    [{ dailyCreditBudget: 10 }, { label: 'changed' }, 50],
    [
      { dailyCreditBudget: 10, weeklyCreditBudget: 12 },
      { dailyCreditBudget: 20 },
      100,
    ],
    [
      { dailyCreditBudget: 10 },
      { dailyCreditBudget: 20, weeklyCreditBudget: 0 },
      0,
    ],
  ])(
    'preserves/recalculates update defaults',
    async (config, update, expected) => {
      const { service, row, prisma } = setup(config);
      await service.patch('strategy', update);
      expect(row.config.weeklyCreditBudget).toBe(expected);
      expect(prisma.$queryRaw).toHaveBeenCalledOnce();
    },
  );
  it('uses the terminal transaction and latest counters with bounded ISO history', async () => {
    const { service, prisma, row } = setup({
      creditsUsedToday: 1,
      creditsUsedThisWeek: 2,
      runHistory: Array.from({ length: 50 }, () => ({ executionId: 'old' })),
      consecutiveFailures: 2,
    });
    await service.recordRun(
      'strategy',
      {
        startedAt: new Date('2026-09-24T00:00:00Z'),
        completedAt: new Date('2026-09-24T00:00:01Z'),
        status: 'COMPLETED' as never,
        creditsUsed: 0.25,
        contentGenerated: 0,
        executionId: 'run',
      },
      'org',
      prisma as never,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(row.config).toMatchObject({
      creditsUsedToday: 1.25,
      creditsUsedThisWeek: 2.25,
      consecutiveFailures: 0,
      lastRunAt: '2026-09-24T00:00:01.000Z',
    });
    expect(row.config.runHistory).toHaveLength(50);
    expect((row.config.runHistory as unknown[]).at(-1)).toMatchObject({
      executionId: 'run',
      completedAt: '2026-09-24T00:00:01.000Z',
    });
  });
  it('records failed runs, pauses at three, and requires manual reactivation at five', async () => {
    const { service, row } = setup({ consecutiveFailures: 2 });
    const run = {
      startedAt: new Date(),
      completedAt: new Date(),
      status: 'FAILED' as never,
      creditsUsed: 0,
      contentGenerated: 0,
    };
    await service.recordRun('strategy', run, 'org');
    expect(row.isActive).toBe(false);
    expect(row.config.consecutiveFailures).toBe(3);
    await service.recordRun('strategy', run, 'org');
    await service.recordRun('strategy', run, 'org');
    expect(row.config.requiresManualReactivation).toBe(true);
  });
  it('does not mutate a foreign strategy', async () => {
    const { service, prisma } = setup();
    await service.recordRun(
      'strategy',
      {
        startedAt: new Date(),
        completedAt: new Date(),
        status: 'COMPLETED' as never,
        creditsUsed: 2,
        contentGenerated: 0,
      },
      'foreign',
    );
    expect(prisma.agentStrategy.update).not.toHaveBeenCalled();
  });
});
