import { CronJobsController } from '@api/collections/cron-jobs/controllers/cron-jobs.controller';
import type { CreateCronJobDto } from '@api/collections/cron-jobs/dto/create-cron-job.dto';
import type { UpdateCronJobDto } from '@api/collections/cron-jobs/dto/update-cron-job.dto';
import { CronJobsService } from '@api/collections/cron-jobs/services/cron-jobs.service';
import { ClerkGuard } from '@api/helpers/guards/clerk/clerk.guard';
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
      .overrideGuard(ClerkGuard)
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

  describe('create', () => {
    it('should create a cron job and return it serialized', async () => {
      mockServiceMethods.create.mockResolvedValue(mockCronJob);

      const dto: CreateCronJobDto = {
        jobType: 'newsletter_substack',
        name: 'Daily Newsletter',
        schedule: '0 9 * * 1-5',
      };

      const result = await controller.create(mockRequest, mockUser as any, dto);

      expect(mockServiceMethods.create).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439014',
        '507f1f77bcf86cd799439012',
        dto,
      );
      expect(result).toEqual({ data: mockCronJob });
    });
  });

  describe('update', () => {
    it('should update a cron job and return it serialized', async () => {
      mockServiceMethods.update.mockResolvedValue(mockCronJob);

      const dto: UpdateCronJobDto = { name: 'Updated Name' };

      const result = await controller.update(
        mockRequest,
        mockUser as any,
        '507f1f77bcf86cd799439011',
        dto,
      );

      expect(mockServiceMethods.update).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439011',
        '507f1f77bcf86cd799439012',
        dto,
      );
      expect(result).toEqual({ data: mockCronJob });
    });

    it('should throw when cron job is not found', async () => {
      mockServiceMethods.update.mockResolvedValue(null);

      await expect(
        controller.update(
          mockRequest,
          mockUser as any,
          'nonexistent-id',
          {} as UpdateCronJobDto,
        ),
      ).rejects.toThrow();
    });
  });

  describe('runNow', () => {
    it('should trigger a run and return the cron run serialized', async () => {
      mockServiceMethods.runNow.mockResolvedValue(mockCronRun);

      const result = await controller.runNow(
        mockRequest,
        mockUser as any,
        '507f1f77bcf86cd799439011',
      );

      expect(mockServiceMethods.runNow).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439011',
        '507f1f77bcf86cd799439012',
      );
      expect(result).toEqual({ data: mockCronRun });
    });

    it('should throw when cron job is not found', async () => {
      mockServiceMethods.runNow.mockResolvedValue(null);

      await expect(
        controller.runNow(mockRequest, mockUser as any, 'nonexistent-id'),
      ).rejects.toThrow();
    });
  });

  describe('pause', () => {
    it('should pause a cron job and return it serialized', async () => {
      const paused = { ...mockCronJob, enabled: false };
      mockServiceMethods.pause.mockResolvedValue(paused);

      const result = await controller.pause(
        mockRequest,
        mockUser as any,
        '507f1f77bcf86cd799439011',
      );

      expect(mockServiceMethods.pause).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439011',
        '507f1f77bcf86cd799439012',
      );
      expect(result).toEqual({ data: paused });
    });

    it('should throw when cron job is not found', async () => {
      mockServiceMethods.pause.mockResolvedValue(null);

      await expect(
        controller.pause(mockRequest, mockUser as any, 'nonexistent-id'),
      ).rejects.toThrow();
    });
  });

  describe('resume', () => {
    it('should resume a cron job and return it serialized', async () => {
      const resumed = { ...mockCronJob, enabled: true };
      mockServiceMethods.resume.mockResolvedValue(resumed);

      const result = await controller.resume(
        mockRequest,
        mockUser as any,
        '507f1f77bcf86cd799439011',
      );

      expect(mockServiceMethods.resume).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439011',
        '507f1f77bcf86cd799439012',
      );
      expect(result).toEqual({ data: resumed });
    });

    it('should throw when cron job is not found', async () => {
      mockServiceMethods.resume.mockResolvedValue(null);

      await expect(
        controller.resume(mockRequest, mockUser as any, 'nonexistent-id'),
      ).rejects.toThrow();
    });
  });

  describe('delete', () => {
    it('should soft-delete a cron job and return it serialized', async () => {
      const deleted = { ...mockCronJob, enabled: false, isDeleted: true };
      mockServiceMethods.delete.mockResolvedValue(deleted);

      const result = await controller.delete(
        mockRequest,
        mockUser as any,
        '507f1f77bcf86cd799439011',
      );

      expect(mockServiceMethods.delete).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439011',
        '507f1f77bcf86cd799439012',
      );
      expect(result).toEqual({ data: deleted });
    });

    it('should throw when deleting a missing cron job', async () => {
      mockServiceMethods.delete.mockResolvedValue(null);

      await expect(
        controller.delete(mockRequest, mockUser as any, 'nonexistent-id'),
      ).rejects.toThrow();
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
