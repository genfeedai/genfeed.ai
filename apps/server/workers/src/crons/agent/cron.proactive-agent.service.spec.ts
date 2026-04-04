import { AgentGoalsService } from '@api/collections/agent-goals/services/agent-goals.service';
import { AgentRunsService } from '@api/collections/agent-runs/services/agent-runs.service';
import { AgentStrategy } from '@api/collections/agent-strategies/schemas/agent-strategy.schema';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { AgentRunQueueService } from '@api/queues/agent-run/agent-run-queue.service';
import { CacheService } from '@api/services/cache/services/cache.service';
import { AgentRunFrequency, AgentType } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { CronProactiveAgentService } from '@workers/crons/agent/cron.proactive-agent.service';
import { Types } from 'mongoose';

describe('CronProactiveAgentService', () => {
  let service: CronProactiveAgentService;
  let agentGoalsService: { getGoalSummary: ReturnType<typeof vi.fn> };
  let agentStrategyModel: {
    aggregate: ReturnType<typeof vi.fn>;
    updateOne: ReturnType<typeof vi.fn>;
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
    agentStrategyModel = {
      aggregate: vi.fn().mockResolvedValue([]),
      updateOne: vi.fn().mockResolvedValue({}),
    };
    agentRunsService = {
      create: vi.fn().mockResolvedValue({ _id: new Types.ObjectId() }),
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
          provide: getModelToken(AgentStrategy.name, 'agent'),
          useValue: agentStrategyModel,
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
    const organizationId = new Types.ObjectId();
    const strategy = {
      engagementEnabled: false,
      goalId: new Types.ObjectId(),
      label: 'Growth strategy',
      organization: organizationId,
      postsPerWeek: 7,
      runFrequency: AgentRunFrequency.DAILY,
      topics: ['ai'],
      type: AgentType.GENERAL,
      user: new Types.ObjectId(),
    };

    const message = await (
      service as unknown as {
        buildSyntheticUserMessage: (s: unknown) => Promise<string>;
      }
    ).buildSyntheticUserMessage(strategy);

    expect(agentGoalsService.getGoalSummary).toHaveBeenCalledWith(
      String(strategy.goalId),
      String(organizationId),
    );
    expect(message).toContain('Advance the linked goal');
    expect(message).toContain('25% complete');
  });

  it('should enforce the organization agent daily cap before queueing a run', async () => {
    const strategyId = new Types.ObjectId();
    organizationSettingsService.findOne.mockResolvedValue({
      agentPolicy: {
        creditGovernance: {
          agentDailyCreditCap: 40,
        },
      },
    });

    const strategy = {
      _id: strategyId,
      creditsUsedThisWeek: 0,
      creditsUsedToday: 50,
      dailyCreditBudget: 100,
      dailyCreditsUsed: 50,
      goalId: null,
      isActive: true,
      label: 'Capped strategy',
      minCreditThreshold: 10,
      organization: new Types.ObjectId(),
      postsPerWeek: 3,
      runFrequency: AgentRunFrequency.DAILY,
      topics: ['ai'],
      user: new Types.ObjectId(),
      weeklyCreditBudget: 300,
    };

    await (
      service as unknown as {
        executeStrategy: (value: unknown) => Promise<void>;
      }
    ).executeStrategy(strategy);

    expect(agentRunsService.create).not.toHaveBeenCalled();
    expect(agentRunQueueService.queueRun).not.toHaveBeenCalled();
    expect(agentStrategyModel.updateOne).toHaveBeenCalledWith(
      { _id: String(strategyId) },
      { $set: { nextRunAt: expect.any(Date) } },
    );
  });
});
