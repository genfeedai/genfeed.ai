import { AgentStrategyReportsService } from '@api/collections/agent-strategies/services/agent-strategy-reports.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { type AgentStrategyReport } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('AgentStrategyReportsService', () => {
  let service: AgentStrategyReportsService;
  let model: {
    create: ReturnType<typeof vi.fn>;
    find: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
  };

  const orgId = 'test-object-id'.toString();
  const strategyId = 'test-object-id'.toString();

  const mockReport = {
    _id: 'test-object-id',
    generatedCount: 5,
    isDeleted: false,
    organization: new string(orgId),
    periodEnd: new Date(),
    periodStart: new Date(),
    reportType: 'weekly',
    strategy: new string(strategyId),
  };

  beforeEach(async () => {
    model = {
      create: vi.fn().mockResolvedValue(mockReport),
      find: vi.fn().mockReturnValue({
        sort: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue([mockReport]),
        }),
      }),
      findOne: vi.fn().mockReturnValue({
        sort: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue(mockReport),
        }),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentStrategyReportsService,
        { provide: PrismaService, useValue: model },
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

    service = module.get<AgentStrategyReportsService>(
      AgentStrategyReportsService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── listByStrategy ─────────────────────────────────────────────────────────

  describe('listByStrategy', () => {
    it('should query with organization and strategy filters', async () => {
      await service.listByStrategy(strategyId, orgId);

      expect(model.find).toHaveBeenCalledWith(
        expect.objectContaining({
          isDeleted: false,
          organization: new string(orgId),
          strategy: new string(strategyId),
        }),
      );
    });

    it('should include reportType filter when provided', async () => {
      await service.listByStrategy(
        strategyId,
        orgId,
        'weekly' as 'weekly' & string,
      );

      expect(model.find).toHaveBeenCalledWith(
        expect.objectContaining({
          isDeleted: false,
          organization: new string(orgId),
          reportType: 'weekly',
          strategy: new string(strategyId),
        }),
      );
    });

    it('should sort by periodEnd descending', async () => {
      const sortMock = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue([mockReport]),
      });
      model.find.mockReturnValue({ sort: sortMock });

      await service.listByStrategy(strategyId, orgId);

      expect(sortMock).toHaveBeenCalledWith({ periodEnd: -1 });
    });

    it('should return array of reports', async () => {
      const result = await service.listByStrategy(strategyId, orgId);
      expect(result).toEqual([mockReport]);
    });
  });

  // ─── getLatest ──────────────────────────────────────────────────────────────

  describe('getLatest', () => {
    it('should query with organization and strategy filters', async () => {
      await service.getLatest(strategyId, orgId);

      expect(model.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          isDeleted: false,
          organization: new string(orgId),
          strategy: new string(strategyId),
        }),
      );
    });

    it('should include reportType filter when provided', async () => {
      await service.getLatest(
        strategyId,
        orgId,
        'monthly' as 'monthly' & string,
      );

      expect(model.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          reportType: 'monthly',
        }),
      );
    });

    it('should return null when no report found', async () => {
      model.findOne.mockReturnValue({
        sort: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue(null),
        }),
      });

      const result = await service.getLatest(strategyId, orgId);
      expect(result).toBeNull();
    });

    it('should sort by periodEnd descending', async () => {
      const sortMock = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(mockReport),
      });
      model.findOne.mockReturnValue({ sort: sortMock });

      await service.getLatest(strategyId, orgId);

      expect(sortMock).toHaveBeenCalledWith({ periodEnd: -1 });
    });
  });

  // ─── createReport ───────────────────────────────────────────────────────────

  describe('createReport', () => {
    it('should create a report with isDeleted: false', async () => {
      const input = {
        generatedCount: 10,
        organization: new string(orgId),
        periodEnd: new Date(),
        periodStart: new Date(),
        reportType: 'weekly' as 'weekly' & string,
        strategy: new string(strategyId),
      };

      await service.createReport(input as never);

      expect(model.create).toHaveBeenCalledWith(
        expect.objectContaining({
          isDeleted: false,
          metadata: {},
        }),
      );
    });

    it('should preserve provided metadata', async () => {
      const input = {
        metadata: { source: 'autopilot' },
        organization: new string(orgId),
        periodEnd: new Date(),
        periodStart: new Date(),
        reportType: 'weekly' as 'weekly' & string,
        strategy: new string(strategyId),
      };

      await service.createReport(input as never);

      expect(model.create).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: { source: 'autopilot' },
        }),
      );
    });

    it('should return the created document', async () => {
      const result = await service.createReport({
        organization: new string(orgId),
        periodEnd: new Date(),
        periodStart: new Date(),
        reportType: 'weekly' as 'weekly' & string,
        strategy: new string(strategyId),
      } as never);

      expect(result).toBe(mockReport);
    });
  });
});
