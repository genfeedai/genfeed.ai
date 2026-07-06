import { BetterAuthGuard } from '@api/auth/better-auth/guards/better-auth.guard';
import { CronJobsController } from '@api/collections/cron-jobs/controllers/cron-jobs.controller';
import { CronJobsService } from '@api/collections/cron-jobs/services/cron-jobs.service';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Request } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@api/helpers/utils/response/response.util', () => ({
  returnNotFound: vi.fn(() => {
    const { HttpException } = require('@nestjs/common');
    throw new HttpException({ title: 'Not found' }, 404);
  }),
  serializeCollection: vi.fn(
    (
      _req: Request,
      _serializer: unknown,
      data: { docs?: unknown[] } | unknown[],
    ) => ({
      data: (data as { docs?: unknown[] }).docs ?? data,
    }),
  ),
  serializeSingle: vi.fn(
    (_req: Request, _serializer: unknown, data: unknown) => ({ data }),
  ),
}));

describe('CronJobsController', () => {
  let controller: CronJobsController;

  const mockUser = {
    id: 'user_123',
    publicMetadata: {
      organization: '507f1f77bcf86cd799439012',
      user: '507f1f77bcf86cd799439014',
    },
  };

  const mockRequest = {
    originalUrl: '/api/cron-jobs',
    query: {},
  } as Request;

  const mockCronJob = {
    _id: '507f1f77bcf86cd799439011',
    enabled: true,
    jobType: 'newsletter_substack' as const,
    name: 'Daily Newsletter',
    organization: '507f1f77bcf86cd799439012',
    schedule: '0 9 * * 1-5',
  };

  const mockCronRun = {
    _id: '507f1f77bcf86cd799439022',
    cronJobId: '507f1f77bcf86cd799439011',
    status: 'success',
    triggeredAt: new Date(),
  };

  const mockServiceMethods = {
    create: vi.fn(),
    delete: vi.fn(),
    getRun: vi.fn(),
    getRuns: vi.fn(),
    list: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    runNow: vi.fn(),
    update: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CronJobsController],
      providers: [{ provide: CronJobsService, useValue: mockServiceMethods }],
    })
      .overrideGuard(BetterAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<CronJobsController>(CronJobsController);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('should return a list of cron jobs for the organization', async () => {
      mockServiceMethods.list.mockResolvedValue([mockCronJob]);

      await controller.findAll(mockRequest, mockUser as any, {});

      expect(mockServiceMethods.list).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439012',
        { enabled: undefined, jobType: undefined },
      );
    });

    it('should filter by enabled=true when query has enabled=true', async () => {
      mockServiceMethods.list.mockResolvedValue([mockCronJob]);

      await controller.findAll(
        mockRequest,
        mockUser as any,
        {
          enabled: 'true',
        } as any,
      );

      expect(mockServiceMethods.list).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439012',
        { enabled: true, jobType: undefined },
      );
    });

    it('should filter by enabled=false when query has enabled=false', async () => {
      mockServiceMethods.list.mockResolvedValue([]);

      await controller.findAll(
        mockRequest,
        mockUser as any,
        {
          enabled: 'false',
        } as any,
      );

      expect(mockServiceMethods.list).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439012',
        { enabled: false, jobType: undefined },
      );
    });

    it('should filter by jobType when provided', async () => {
      mockServiceMethods.list.mockResolvedValue([mockCronJob]);

      await controller.findAll(
        mockRequest,
        mockUser as any,
        {
          jobType: 'newsletter',
        } as any,
      );

      expect(mockServiceMethods.list).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439012',
        { enabled: undefined, jobType: 'newsletter' },
      );
    });
  });

  describe('runs', () => {
    it('should return a list of runs for the cron job', async () => {
      mockServiceMethods.getRuns.mockResolvedValue([mockCronRun]);

      await controller.runs(
        mockRequest,
        mockUser as any,
        '507f1f77bcf86cd799439011',
      );

      expect(mockServiceMethods.getRuns).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439011',
        '507f1f77bcf86cd799439012',
      );
    });
  });

  describe('runById', () => {
    it('should return a specific run by ID', async () => {
      mockServiceMethods.getRun.mockResolvedValue(mockCronRun);

      const result = await controller.runById(
        mockRequest,
        mockUser as any,
        '507f1f77bcf86cd799439011',
        '507f1f77bcf86cd799439022',
      );

      expect(mockServiceMethods.getRun).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439011',
        '507f1f77bcf86cd799439022',
        '507f1f77bcf86cd799439012',
      );
      expect(result).toEqual({ data: mockCronRun });
    });

    it('should throw when run is not found', async () => {
      mockServiceMethods.getRun.mockResolvedValue(null);

      await expect(
        controller.runById(
          mockRequest,
          mockUser as any,
          '507f1f77bcf86cd799439011',
          'nonexistent-run-id',
        ),
      ).rejects.toThrow();
    });
  });
});
