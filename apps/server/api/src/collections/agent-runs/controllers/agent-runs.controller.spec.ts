vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeCollection: vi.fn((_req, _serializer, data) => ({
    data: data.docs || data,
  })),
  serializeSingle: vi.fn((_req, _serializer, data) => ({ data })),
}));

import { BetterAuthGuard } from '@api/auth/better-auth/guards/better-auth.guard';
import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { AgentRunsController } from '@api/collections/agent-runs/controllers/agent-runs.controller';
import type {
  AgentRunStatsQueryDto,
  AgentRunsQueryDto,
} from '@api/collections/agent-runs/dto/agent-runs-query.dto';
import type { CreateAgentRunDto } from '@api/collections/agent-runs/dto/create-agent-run.dto';
import type { AgentRunDocument } from '@api/collections/agent-runs/schemas/agent-run.schema';
import { AgentRunsService } from '@api/collections/agent-runs/services/agent-runs.service';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { AgentRunQueueService } from '@api/queues/agent-run/agent-run-queue.service';
import { AgentThreadEngineService } from '@api/services/agent-threading/services/agent-thread-engine.service';
import { LoggerService } from '@libs/logger/logger.service';
import { ServiceUnavailableException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

describe('AgentRunsController', () => {
  let controller: AgentRunsController;

  const mockUser: User = {
    id: 'user_123',
    publicMetadata: {
      brand: '507f1f77bcf86cd799439013',
      organization: '507f1f77bcf86cd799439012',
      user: '507f1f77bcf86cd799439014',
    },
  };

  const mockRequest = { originalUrl: '/api/runs', query: {} } as Request;

  const buildQuery = (query: Partial<AgentRunsQueryDto> = {}) =>
    controller.buildFindAllQuery(mockUser, query as AgentRunsQueryDto);

  const mockServiceMethods = {
    cancel: vi.fn(),
    create: vi.fn(),
    findAll: vi.fn(),
    findOne: vi.fn(),
    getActiveRuns: vi.fn(),
    getStats: vi.fn(),
    patch: vi.fn(),
    prepareRetry: vi.fn(),
    remove: vi.fn(),
  };

  const mockQueueService = {
    queueRun: vi.fn(),
  };

  const mockThreadEngineService = {
    appendEvent: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AgentRunsController],
      providers: [
        { provide: AgentRunsService, useValue: mockServiceMethods },
        { provide: AgentRunQueueService, useValue: mockQueueService },
        {
          provide: AgentThreadEngineService,
          useValue: mockThreadEngineService,
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
      .overrideGuard(BetterAuthGuard)
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
      const query = buildQuery();

      expect(query).toEqual({
        orderBy: { createdAt: -1 },
        where: {
          brand: '507f1f77bcf86cd799439013',
          isDeleted: false,
          organization: '507f1f77bcf86cd799439012',
        },
      });
    });

    it('should prefer explicit brand filter over auth metadata brand', () => {
      const query = buildQuery({
        brand: '507f1f77bcf86cd799439099',
      });

      expect(query.where).toMatchObject({
        brand: '507f1f77bcf86cd799439099',
      });
    });

    it('should filter routingPolicy using Prisma JSON path syntax', () => {
      const query = buildQuery({
        routingPolicy: 'cost-optimized',
      });

      expect(query.where).toMatchObject({
        metadata: { path: ['routingPolicy'], equals: 'cost-optimized' },
      });
      expect(query.where).not.toHaveProperty('metadata.routingPolicy');
    });

    it('should filter webSearchEnabled using Prisma JSON path syntax', () => {
      const query = buildQuery({
        webSearchEnabled: true,
      });

      expect(query.where).toMatchObject({
        metadata: { path: ['webSearchEnabled'], equals: true },
      });
      expect(query.where).not.toHaveProperty('metadata.webSearchEnabled');
    });

    it('should combine routingPolicy and webSearchEnabled via AND when both present', () => {
      const query = buildQuery({
        routingPolicy: 'cost-optimized',
        webSearchEnabled: false,
      });

      expect(Array.isArray(query.where.AND)).toBe(true);
      expect(query.where.AND).toContainEqual({
        metadata: { path: ['routingPolicy'], equals: 'cost-optimized' },
      });
      expect(query.where.AND).toContainEqual({
        metadata: { path: ['webSearchEnabled'], equals: false },
      });
    });

    it('should filter by model using Prisma JSON path string_contains', () => {
      const query = buildQuery({
        model: 'gpt-4o',
      });

      expect(query.where.OR).toEqual([
        { metadata: { path: ['actualModel'], string_contains: 'gpt-4o' } },
        { metadata: { path: ['requestedModel'], string_contains: 'gpt-4o' } },
      ]);
    });

    it('should build search OR with real column contains and JSON path string_contains', () => {
      const query = buildQuery({
        q: 'test search',
      });

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
      const query = buildQuery({
        model: 'gpt-4o',
        q: 'hello',
      });

      expect(Array.isArray(query.where.AND)).toBe(true);
      const andConditions = query.where.AND as Array<{ OR: unknown[] }>;
      expect(andConditions).toHaveLength(2);
      expect(andConditions[0]).toHaveProperty('OR');
      expect(andConditions[1]).toHaveProperty('OR');
      expect(query.where).not.toHaveProperty('OR');
    });

    it('should apply credits sortMode', () => {
      const query = buildQuery({
        sortMode: 'credits',
      });

      expect(query.orderBy).toEqual({ createdAt: -1, creditsUsed: -1 });
    });

    it('should apply duration sortMode', () => {
      const query = buildQuery({
        sortMode: 'duration',
      });

      expect(query.orderBy).toEqual({ createdAt: -1, durationMs: -1 });
    });

    it('should filter by trigger column directly', () => {
      const query = buildQuery({
        trigger: 'manual',
      });

      expect(query.where).toMatchObject({ trigger: 'manual' });
    });
  });

  describe('canUserModifyEntity', () => {
    it('should return true when organization matches', () => {
      const entity = { organization: { id: '507f1f77bcf86cd799439012' } };
      expect(
        controller.canUserModifyEntity(mockUser, entity as AgentRunDocument),
      ).toBe(true);
    });

    it('should return true for super admin', () => {
      const superAdmin: User = {
        ...mockUser,
        publicMetadata: { ...mockUser.publicMetadata, isSuperAdmin: true },
      };
      const entity = { organization: { _id: 'different_org' } };
      expect(
        controller.canUserModifyEntity(superAdmin, entity as AgentRunDocument),
      ).toBe(true);
    });

    it('should let super admin bypass brand scope', () => {
      const superAdmin: User = {
        ...mockUser,
        publicMetadata: { ...mockUser.publicMetadata, isSuperAdmin: true },
      };
      const entity = {
        brand: '507f1f77bcf86cd799439099',
        organization: { _id: 'different_org' },
      };

      expect(
        controller.canUserModifyEntity(superAdmin, entity as AgentRunDocument),
      ).toBe(true);
    });

    it('should return false for non-matching organization', () => {
      const entity = { organization: { _id: 'different_org' } };
      expect(
        controller.canUserModifyEntity(mockUser, entity as AgentRunDocument),
      ).toBe(false);
    });

    it('should return false for a different brand in the same organization', () => {
      const entity = {
        brand: '507f1f77bcf86cd799439099',
        organization: { id: '507f1f77bcf86cd799439012' },
      };

      expect(
        controller.canUserModifyEntity(mockUser, entity as AgentRunDocument),
      ).toBe(false);
    });
  });

  describe('enrichCreateDto', () => {
    it('replaces body supplied scope with authenticated scope', () => {
      const bodySuppliedScope = {
        brand: 'other-brand',
        brandId: 'other-brand-id',
        label: 'Run',
        organization: 'other-org',
        organizationId: 'other-org-id',
        trigger: 'manual',
        user: 'other-user',
        userId: 'other-user-id',
      } satisfies Partial<CreateAgentRunDto> & Record<string, unknown>;

      const dto = controller.enrichCreateDto(
        bodySuppliedScope,
        mockUser,
      ) as CreateAgentRunDto & Record<string, unknown>;

      expect(dto).toMatchObject({
        brandId: '507f1f77bcf86cd799439013',
        organizationId: '507f1f77bcf86cd799439012',
        userId: '507f1f77bcf86cd799439014',
      });
      expect(dto).not.toHaveProperty('brand');
      expect(dto).not.toHaveProperty('organization');
      expect(dto).not.toHaveProperty('user');
    });
  });

  describe('getActiveRuns', () => {
    it('should return active runs for organization', async () => {
      const mockRuns = [{ _id: 'run1', status: 'running' }];
      mockServiceMethods.getActiveRuns.mockResolvedValue(mockRuns);

      await controller.getActiveRuns(mockRequest, mockUser);

      expect(mockServiceMethods.getActiveRuns).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439012',
        {
          brandId: '507f1f77bcf86cd799439013',
          cursor: undefined,
          limit: undefined,
        },
      );
    });
  });

  describe('getStats', () => {
    it('should return stats for organization', async () => {
      const mockStats = { active: 2, completed: 8, total: 10 };
      mockServiceMethods.getStats.mockResolvedValue(mockStats);

      const result = await controller.getStats(mockUser, {
        timeRange: '30d',
      } as AgentRunStatsQueryDto);

      expect(mockServiceMethods.getStats).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439012',
        { timeRange: '30d' },
        '507f1f77bcf86cd799439013',
      );
      expect(result).toEqual(mockStats);
    });
  });

  describe('cancelRun', () => {
    it('should cancel an agent run', async () => {
      const mockRun = { _id: 'run1', status: 'cancelled' };
      mockServiceMethods.cancel.mockResolvedValue(mockRun);

      await controller.cancelRun(mockRequest, 'run1', mockUser);

      expect(mockServiceMethods.cancel).toHaveBeenCalledWith(
        'run1',
        '507f1f77bcf86cd799439012',
        '507f1f77bcf86cd799439013',
      );
    });

    it('should throw NotFoundException when run not found', async () => {
      mockServiceMethods.cancel.mockResolvedValue(null);

      await expect(
        controller.cancelRun(mockRequest, 'nonexistent', mockUser),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('retryRun', () => {
    const preparation = {
      jobData: {
        organizationId: '507f1f77bcf86cd799439012',
        runId: 'run1',
        userId: 'user_run_owner',
      },
      previousStatus: 'FAILED',
      run: { id: 'run1', retryCount: 1, status: 'PENDING' },
    };

    it('should reset the run, requeue it, and scope by auth metadata', async () => {
      mockServiceMethods.prepareRetry.mockResolvedValue(preparation);
      mockQueueService.queueRun.mockResolvedValue('agent-run-run1');

      const result = await controller.retryRun(mockRequest, 'run1', mockUser);

      expect(mockServiceMethods.prepareRetry).toHaveBeenCalledWith(
        'run1',
        '507f1f77bcf86cd799439012',
        {
          brandId: '507f1f77bcf86cd799439013',
          retriedBy: '507f1f77bcf86cd799439014',
        },
      );
      expect(mockQueueService.queueRun).toHaveBeenCalledWith(
        preparation.jobData,
      );
      expect(result).toEqual({ data: preparation.run });
    });

    it('should throw NotFoundException when run not found', async () => {
      mockServiceMethods.prepareRetry.mockResolvedValue(null);

      await expect(
        controller.retryRun(mockRequest, 'nonexistent', mockUser),
      ).rejects.toThrow(NotFoundException);
      expect(mockQueueService.queueRun).not.toHaveBeenCalled();
    });

    it('should revert the run status when enqueueing fails', async () => {
      mockServiceMethods.prepareRetry.mockResolvedValue(preparation);
      mockQueueService.queueRun.mockRejectedValue(new Error('redis down'));

      await expect(
        controller.retryRun(mockRequest, 'run1', mockUser),
      ).rejects.toThrow('redis down');
      expect(mockServiceMethods.patch).toHaveBeenCalledWith('run1', {
        status: 'FAILED',
      });
    });

    it('should append a run.retried thread event when the run has a thread', async () => {
      mockServiceMethods.prepareRetry.mockResolvedValue({
        ...preparation,
        run: { ...preparation.run, threadId: 'thread1' },
      });
      mockQueueService.queueRun.mockResolvedValue('agent-run-run1');
      mockThreadEngineService.appendEvent.mockResolvedValue({});

      await controller.retryRun(mockRequest, 'run1', mockUser);

      expect(mockThreadEngineService.appendEvent).toHaveBeenCalledWith({
        commandId: 'run-retried:run1:1',
        organizationId: '507f1f77bcf86cd799439012',
        payload: {
          detail: 'The run was requeued for retry by the user.',
          label: 'Run retried',
          status: 'pending',
        },
        runId: 'run1',
        threadId: 'thread1',
        type: 'run.retried',
        userId: '507f1f77bcf86cd799439014',
      });
    });

    it('should not fail the retry when the thread event append fails', async () => {
      mockServiceMethods.prepareRetry.mockResolvedValue({
        ...preparation,
        run: { ...preparation.run, threadId: 'thread1' },
      });
      mockQueueService.queueRun.mockResolvedValue('agent-run-run1');
      mockThreadEngineService.appendEvent.mockRejectedValue(
        new Error('thread not found'),
      );

      const result = await controller.retryRun(mockRequest, 'run1', mockUser);

      expect(result).toEqual({
        data: { ...preparation.run, threadId: 'thread1' },
      });
    });

    it('should throw ServiceUnavailableException when the queue is not wired', async () => {
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
        .overrideGuard(BetterAuthGuard)
        .useValue({ canActivate: () => true })
        .compile();

      const queuelessController =
        module.get<AgentRunsController>(AgentRunsController);

      await expect(
        queuelessController.retryRun(mockRequest, 'run1', mockUser),
      ).rejects.toThrow(ServiceUnavailableException);
      expect(mockServiceMethods.prepareRetry).not.toHaveBeenCalled();
    });
  });
});
