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

      expect(query).toEqual({
        orderBy: { createdAt: -1 },
        where: {
          isDeleted: false,
          organization: '507f1f77bcf86cd799439012',
        },
      });
    });

    it('should filter routingPolicy using Prisma JSON path syntax', () => {
      const query = controller.buildFindAllQuery(
        mockUser as any,
        {
          routingPolicy: 'cost-optimized',
        } as any,
      );

      expect(query.where).toMatchObject({
        metadata: { path: ['routingPolicy'], equals: 'cost-optimized' },
      });
      expect(query.where).not.toHaveProperty('metadata.routingPolicy');
    });

    it('should filter webSearchEnabled using Prisma JSON path syntax', () => {
      const query = controller.buildFindAllQuery(
        mockUser as any,
        {
          webSearchEnabled: true,
        } as any,
      );

      expect(query.where).toMatchObject({
        metadata: { path: ['webSearchEnabled'], equals: true },
      });
      expect(query.where).not.toHaveProperty('metadata.webSearchEnabled');
    });

    it('should combine routingPolicy and webSearchEnabled via AND when both present', () => {
      const query = controller.buildFindAllQuery(
        mockUser as any,
        {
          routingPolicy: 'cost-optimized',
          webSearchEnabled: false,
        } as any,
      );

      expect(Array.isArray(query.where.AND)).toBe(true);
      expect(query.where.AND).toContainEqual({
        metadata: { path: ['routingPolicy'], equals: 'cost-optimized' },
      });
      expect(query.where.AND).toContainEqual({
        metadata: { path: ['webSearchEnabled'], equals: false },
      });
    });

    it('should filter by model using Prisma JSON path string_contains', () => {
      const query = controller.buildFindAllQuery(
        mockUser as any,
        {
          model: 'gpt-4o',
        } as any,
      );

      expect(query.where.OR).toEqual([
        { metadata: { path: ['actualModel'], string_contains: 'gpt-4o' } },
        { metadata: { path: ['requestedModel'], string_contains: 'gpt-4o' } },
      ]);
    });

    it('should build search OR with real column contains and JSON path string_contains', () => {
      const query = controller.buildFindAllQuery(
        mockUser as any,
        {
          q: 'test search',
        } as any,
      );

      expect(Array.isArray(query.where.OR)).toBe(true);
      const orConditions = query.where.OR as unknown[];
      expect(orConditions).toContainEqual({
        label: { contains: 'test search', mode: 'insensitive' },
      });
      expect(orConditions).toContainEqual({
        objective: { contains: 'test search', mode: 'insensitive' },
      });
      expect(orConditions).toContainEqual({
        metadata: { path: ['actualModel'], string_contains: 'test search' },
      });
      expect(orConditions).toContainEqual({
        metadata: { path: ['requestedModel'], string_contains: 'test search' },
      });
      expect(orConditions).toContainEqual({
        metadata: { path: ['routingPolicy'], string_contains: 'test search' },
      });
      // Must NOT use dotted key syntax
      expect(
        orConditions.some((c) => 'metadata.actualModel' in (c as object)),
      ).toBe(false);
    });

    it('should wrap both model OR and search OR inside AND when both are present', () => {
      const query = controller.buildFindAllQuery(
        mockUser as any,
        {
          model: 'gpt-4o',
          q: 'hello',
        } as any,
      );

      expect(Array.isArray(query.where.AND)).toBe(true);
      const andConditions = query.where.AND as Array<{ OR: unknown[] }>;
      expect(andConditions).toHaveLength(2);
      expect(andConditions[0]).toHaveProperty('OR');
      expect(andConditions[1]).toHaveProperty('OR');
      expect(query.where).not.toHaveProperty('OR');
    });

    it('should apply credits sortMode', () => {
      const query = controller.buildFindAllQuery(
        mockUser as any,
        {
          sortMode: 'credits',
        } as any,
      );

      expect(query.orderBy).toEqual({ createdAt: -1, creditsUsed: -1 });
    });

    it('should apply duration sortMode', () => {
      const query = controller.buildFindAllQuery(
        mockUser as any,
        {
          sortMode: 'duration',
        } as any,
      );

      expect(query.orderBy).toEqual({ createdAt: -1, durationMs: -1 });
    });

    it('should filter by trigger column directly', () => {
      const query = controller.buildFindAllQuery(
        mockUser as any,
        {
          trigger: 'manual',
        } as any,
      );

      expect(query.where).toMatchObject({ trigger: 'manual' });
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
        { cursor: undefined, limit: undefined },
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
