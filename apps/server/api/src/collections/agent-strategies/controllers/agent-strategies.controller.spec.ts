import { AgentStrategiesController } from '@api/collections/agent-strategies/controllers/agent-strategies.controller';
import { AgentStrategiesService } from '@api/collections/agent-strategies/services/agent-strategies.service';
import { AgentStrategyAutopilotService } from '@api/collections/agent-strategies/services/agent-strategy-autopilot.service';
import { AgentStrategyReportsService } from '@api/collections/agent-strategies/services/agent-strategy-reports.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('AgentStrategiesController', () => {
  let controller: AgentStrategiesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AgentStrategiesController],
      providers: [
        {
          provide: AgentStrategiesService,
          useValue: {
            create: vi.fn(),
            findAll: vi.fn(),
            findOne: vi.fn(),
            findOneById: vi.fn(),
            patch: vi.fn(),
            remove: vi.fn(),
            toggleActive: vi.fn(),
          },
        },
        {
          provide: AgentStrategyAutopilotService,
          useValue: {
            generateStrategyReport: vi.fn(),
            getPerformanceSnapshot: vi.fn(),
            listStrategyOpportunities: vi.fn(),
          },
        },
        {
          provide: AgentStrategyReportsService,
          useValue: {
            listByStrategy: vi.fn(),
          },
        },
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
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AgentStrategiesController>(
      AgentStrategiesController,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('buildFindAllPipeline', () => {
    it('should build pipeline with filters', () => {
      const user = {
        id: 'user-123',
        publicMetadata: { organization: '507f191e810c19729de860ee'.toString() },
      } as never;
      const query = { isDeleted: false } as never;
      const pipeline = controller.buildFindAllPipeline(user, query);
      expect(pipeline).toBeInstanceOf(Array);
    });

    it('should include $match with organization from user metadata', () => {
      const orgId = '507f191e810c19729de860ee'.toString();
      const user = {
        id: 'user-123',
        publicMetadata: { organization: orgId },
      } as never;
      const query = { isDeleted: false } as never;
      const pipeline = controller.buildFindAllPipeline(user, query);
      const matchStage = pipeline[0] as { $match: Record<string, unknown> };
      expect(matchStage.$match.organization).toEqual(orgId);
    });

    it('should filter by platform when provided', () => {
      const user = {
        id: 'user-123',
        publicMetadata: { organization: '507f191e810c19729de860ee'.toString() },
      } as never;
      const query = { isDeleted: false, platform: 'instagram' } as never;
      const pipeline = controller.buildFindAllPipeline(user, query);
      const matchStage = pipeline[0] as { $match: Record<string, unknown> };
      expect(matchStage.$match.platforms).toBe('instagram');
    });

    it('should include $sort stage', () => {
      const user = {
        id: 'user-123',
        publicMetadata: { organization: '507f191e810c19729de860ee'.toString() },
      } as never;
      const query = { isDeleted: false } as never;
      const pipeline = controller.buildFindAllPipeline(user, query);
      expect(pipeline.length).toBeGreaterThanOrEqual(2);
      expect(pipeline[1]).toHaveProperty('$sort');
    });
  });

  describe('canUserModifyEntity', () => {
    it('should return true when organization matches', () => {
      const orgId = '507f191e810c19729de860ee';
      const user = {
        id: 'user-123',
        publicMetadata: { organization: orgId.toString() },
      } as never;
      const entity = { organization: orgId } as never;
      expect(controller.canUserModifyEntity(user, entity)).toBe(true);
    });

    it('should return false when organization does not match and not super admin', () => {
      const user = {
        id: 'user-123',
        publicMetadata: { organization: '507f191e810c19729de860ee'.toString() },
      } as never;
      const entity = {
        organization: '507f191e810c19729de860ee',
      } as never;
      expect(controller.canUserModifyEntity(user, entity)).toBe(false);
    });
  });

  describe('autopilot routes', () => {
    it('should expose opportunity listing', async () => {
      const autopilot = {
        listStrategyOpportunities: vi.fn().mockResolvedValue([]),
      };
      (
        controller as unknown as {
          agentStrategyAutopilotService: typeof autopilot;
        }
      ).agentStrategyAutopilotService = autopilot;

      await controller.listOpportunities('strategy-id', {
        id: 'user-123',
        publicMetadata: { organization: '507f191e810c19729de860ee'.toString() },
      } as never);

      expect(autopilot.listStrategyOpportunities).toHaveBeenCalled();
    });
  });
});
