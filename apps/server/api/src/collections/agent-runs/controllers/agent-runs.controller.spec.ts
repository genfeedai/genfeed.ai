vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeCollection: vi.fn((_req, _serializer, data) => ({
    data: data.docs || data,
  })),
  serializeSingle: vi.fn((_req, _serializer, data) => ({ data })),
}));

import { AgentRunsController } from '@api/collections/agent-runs/controllers/agent-runs.controller';
import { AgentRunsService } from '@api/collections/agent-runs/services/agent-runs.service';
import { ClerkGuard } from '@api/helpers/guards/clerk/clerk.guard';
import { LoggerService } from '@libs/logger/logger.service';
import { NotFoundException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

describe('AgentRunsController', () => {
  let controller: AgentRunsController;

  const mockUser = {
    id: 'user_123',
    publicMetadata: {
      brand: '507f1f77bcf86cd799439013',
      organization: '507f1f77bcf86cd799439012',
      user: '507f1f77bcf86cd799439014',
    },
  };

  const mockRequest = { originalUrl: '/api/runs', query: {} } as Request;

  const mockServiceMethods = {
    cancel: vi.fn(),
    create: vi.fn(),
    findAll: vi.fn(),
    findOne: vi.fn(),
    getActiveRuns: vi.fn(),
    getStats: vi.fn(),
    patch: vi.fn(),
    remove: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AgentRunsController],
      providers: [
        { provide: AgentRunsService, useValue: mockServiceMethods },
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
      .overrideGuard(ClerkGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AgentRunsController>(AgentRunsController);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('buildFindAllQuery', () => {
    it('should build query with organization filter', () => {
      const query = controller.buildFindAllQuery(mockUser as any, {} as any);

      expect(query).toHaveLength(2);
      expect(query[0]).toEqual({
        match: {
          isDeleted: false,
          organization: '507f1f77bcf86cd799439012',
        },
      });
    });
  });

  describe('canUserModifyEntity', () => {
    it('should return true when organization matches', () => {
      const entity = { organization: { _id: '507f1f77bcf86cd799439012' } };
      expect(
        controller.canUserModifyEntity(mockUser as any, entity as any),
      ).toBe(true);
    });

    it('should return true for super admin', () => {
      const superAdmin = {
        ...mockUser,
        publicMetadata: { ...mockUser.publicMetadata, isSuperAdmin: true },
      };
      const entity = { organization: { _id: 'different_org' } };
      expect(
        controller.canUserModifyEntity(superAdmin as any, entity as any),
      ).toBe(true);
    });

    it('should return false for non-matching organization', () => {
      const entity = { organization: { _id: 'different_org' } };
      expect(
        controller.canUserModifyEntity(mockUser as any, entity as any),
      ).toBe(false);
    });
  });

  describe('getActiveRuns', () => {
    it('should return active runs for organization', async () => {
      const mockRuns = [{ _id: 'run1', status: 'running' }];
      mockServiceMethods.getActiveRuns.mockResolvedValue(mockRuns);

      await controller.getActiveRuns(mockRequest, mockUser as any);

      expect(mockServiceMethods.getActiveRuns).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439012',
      );
    });
  });

  describe('getStats', () => {
    it('should return stats for organization', async () => {
      const mockStats = { active: 2, completed: 8, total: 10 };
      mockServiceMethods.getStats.mockResolvedValue(mockStats);

      const result = await controller.getStats(mockUser as any, {
        timeRange: '30d',
      });

      expect(mockServiceMethods.getStats).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439012',
        { timeRange: '30d' },
      );
      expect(result).toEqual(mockStats);
    });
  });

  describe('cancelRun', () => {
    it('should cancel an agent run', async () => {
      const mockRun = { _id: 'run1', status: 'cancelled' };
      mockServiceMethods.cancel.mockResolvedValue(mockRun);

      await controller.cancelRun(mockRequest, 'run1', mockUser as any);

      expect(mockServiceMethods.cancel).toHaveBeenCalledWith(
        'run1',
        '507f1f77bcf86cd799439012',
      );
    });

    it('should throw NotFoundException when run not found', async () => {
      mockServiceMethods.cancel.mockResolvedValue(null);

      await expect(
        controller.cancelRun(mockRequest, 'nonexistent', mockUser as any),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
