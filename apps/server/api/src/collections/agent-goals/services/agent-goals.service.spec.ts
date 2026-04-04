import { AgentGoal } from '@api/collections/agent-goals/schemas/agent-goal.schema';
import { AgentGoalsService } from '@api/collections/agent-goals/services/agent-goals.service';
import { AnalyticsService } from '@api/endpoints/analytics/analytics.service';
import { LoggerService } from '@libs/logger/logger.service';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';

describe('AgentGoalsService', () => {
  let service: AgentGoalsService;
  let model: {
    create: ReturnType<typeof vi.fn>;
    find: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
    updateOne: ReturnType<typeof vi.fn>;
  };
  let analyticsService: { getOverview: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    model = {
      create: vi.fn(),
      find: vi.fn(),
      findById: vi.fn(),
      findOne: vi.fn(),
      updateOne: vi.fn(),
    };
    analyticsService = { getOverview: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentGoalsService,
        {
          provide: getModelToken(AgentGoal.name, 'agent'),
          useValue: model,
        },
        { provide: AnalyticsService, useValue: analyticsService },
        {
          provide: LoggerService,
          useValue: { log: vi.fn(), warn: vi.fn() },
        },
      ],
    }).compile();

    service = module.get(AgentGoalsService);
  });

  it('should compute progress from analytics overview', async () => {
    const goalId = new Types.ObjectId();
    const goal = {
      _id: goalId,
      brand: undefined,
      endDate: undefined,
      isDeleted: false,
      label: 'Reach 1000 views',
      metric: 'views',
      organization: new Types.ObjectId(),
      startDate: undefined,
      targetValue: 1000,
    };

    model.findOne.mockResolvedValue(goal);
    analyticsService.getOverview.mockResolvedValue({
      avgEngagementRate: 3.4,
      totalPosts: 4,
      totalViews: 250,
    });
    model.updateOne.mockReturnValue({
      exec: vi.fn().mockResolvedValue(undefined),
    });
    model.findById.mockReturnValue({
      exec: vi.fn().mockResolvedValue({
        ...goal,
        currentValue: 250,
        progressPercent: 25,
      }),
    });

    const result = await service.refreshProgress(
      String(goalId),
      String(goal.organization),
    );

    expect(result.currentValue).toBe(250);
    expect(result.progressPercent).toBe(25);
  });
});
