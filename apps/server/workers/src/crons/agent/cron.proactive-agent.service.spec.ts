import { AgentGoalsService } from '@api/collections/agent-goals/services/agent-goals.service';
import { AgentRunsService } from '@api/collections/agent-runs/services/agent-runs.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { AgentRunQueueService } from '@api/queues/agent-run/agent-run-queue.service';
import { CacheService } from '@api/services/cache/services/cache.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { AgentRunFrequency, AgentType } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { CronProactiveAgentService } from '@workers/crons/agent/cron.proactive-agent.service';

describe('CronProactiveAgentService', () => {
  let service: CronProactiveAgentService;
  let agentGoalsService: { getGoalSummary: ReturnType<typeof vi.fn> };
  let prismaService: {
    agentStrategy: {
      findMany: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
  };
  let agentRunsService: { create: ReturnType<typeof vi.fn> };
  let agentRunQueueService: { queueRun: ReturnType<typeof vi.fn> };
  let creditsUtilsService: {
    getOrganizationCreditsBalance: ReturnType<typeof vi.fn>;
  };
  let organizationSettingsService: { findOne: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    agentGoalsService = {
      getGoalSummary: vi
        .fn()
        .mockResolvedValue('Goal "Grow views": 250/1000 views (25% complete).'),
    };
    prismaService = {
      agentStrategy: {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    agentRunsService = {
      create: vi.fn().mockResolvedValue({ id: 'run-id-1' }),
    };
    agentRunQueueService = {
      queueRun: vi.fn().mockResolvedValue(undefined),
    };
    creditsUtilsService = {
      getOrganizationCreditsBalance: vi.fn().mockResolvedValue(500),
    };
    organizationSettingsService = {
      findOne: vi.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CronProactiveAgentService,
        {
          provide: PrismaService,
          useValue: prismaService,
        },
        { provide: AgentRunsService, useValue: agentRunsService },
        { provide: AgentRunQueueService, useValue: agentRunQueueService },
        { provide: CreditsUtilsService, useValue: creditsUtilsService },
        {
          provide: OrganizationSettingsService,
          useValue: organizationSettingsService,
        },
        { provide: AgentGoalsService, useValue: agentGoalsService },
        { provide: CacheService, useValue: {} },
        {
          provide: LoggerService,
          useValue: {
            debug: vi.fn(),
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(CronProactiveAgentService);
  });

  it('should include linked goal summary in the synthetic message', async () => {
    const organizationId = 'org-id-1';
    const strategy = {
      config: {
        engagementEnabled: false,
        postsPerWeek: 7,
        runFrequency: AgentRunFrequency.DAILY,
        topics: ['ai'],
      },
      goalId: 'goal-id-1',
      id: 'strategy-id-1',
      label: 'Growth strategy',
      organizationId,
      type: AgentType.GENERAL,
      userId: 'user-id-1',
    };

    const message = await (
      service as unknown as {
        buildSyntheticUserMessage: (s: unknown) => Promise<string>;
      }
    ).buildSyntheticUserMessage(strategy);

    expect(agentGoalsService.getGoalSummary).toHaveBeenCalledWith(
      strategy.goalId,
      organizationId,
    );
    expect(message).toContain('Advance the linked goal');
    expect(message).toContain('25% complete');
  });

  it('should enforce the organization agent daily cap before queueing a run', async () => {
    const strategyId = 'strategy-id-2';
    organizationSettingsService.findOne.mockResolvedValue({
      agentPolicy: {
        creditGovernance: {
          agentDailyCreditCap: 40,
        },
      },
    });

    const strategy = {
      brandId: null,
      config: {
        creditsUsedThisWeek: 0,
        creditsUsedToday: 50,
        dailyCreditBudget: 100,
        dailyCreditsUsed: 50,
        minCreditThreshold: 10,
        postsPerWeek: 3,
        runFrequency: AgentRunFrequency.DAILY,
        weeklyCreditBudget: 300,
      },
      goalId: null,
      id: strategyId,
      isActive: true,
      label: 'Capped strategy',
      organizationId: 'org-id-2',
      userId: 'user-id-2',
    };

    await (
      service as unknown as {
        executeStrategy: (value: unknown) => Promise<void>;
      }
    ).executeStrategy(strategy);

    expect(agentRunsService.create).not.toHaveBeenCalled();
    expect(agentRunQueueService.queueRun).not.toHaveBeenCalled();
    expect(prismaService.agentStrategy.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: strategyId } }),
    );
  });
});
