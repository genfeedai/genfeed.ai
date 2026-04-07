vi.mock('node:crypto', () => ({
  randomUUID: vi.fn(() => 'mock-uuid-1234'),
}));

import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { ConfigService } from '@api/config/config.service';
import type {
  CreateBatchHookRemixDto,
  CreateHookRemixDto,
} from '@api/endpoints/v1/hook-remix/dto/create-hook-remix.dto';
import { HookRemixService } from '@api/endpoints/v1/hook-remix/hook-remix.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { of, throwError } from 'rxjs';

describe('HookRemixService', () => {
  let service: HookRemixService;
  let ingredientsFindOneMock: ReturnType<typeof vi.fn>;
  let httpPostMock: ReturnType<typeof vi.fn>;
  let httpGetMock: ReturnType<typeof vi.fn>;

  const loggerMock = {
    error: vi.fn(),
    log: vi.fn(),
  } as unknown as LoggerService;

  const configMock = {
    get: vi.fn((key: string) => {
      const config: Record<string, string> = {
        GENFEEDAI_MICROSERVICES_FILES_URL: 'http://localhost:3012',
      };
      return config[key];
    }),
  };

  const userId = 'user_abc';
  const organizationId = '507f191e810c19729de860eb';
  const brandId = '507f191e810c19729de860ea';
  const ctaIngredientId = '507f191e810c19729de860ec';

  const mockIngredient = {
    _id: ctaIngredientId,
    brand: brandId,
    cdnUrl: 'https://cdn.genfeed.ai/ingredients/cta.mp4',
    isDeleted: false,
    organization: organizationId,
  };

  const baseHookRemixDto: CreateHookRemixDto = {
    brandId,
    ctaIngredientId,
    youtubeUrl: 'https://youtube.com/watch?v=dQw4w9WgXcQ',
  } as CreateHookRemixDto;

  beforeEach(async () => {
    ingredientsFindOneMock = vi.fn();
    httpPostMock = vi.fn();
    httpGetMock = vi.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HookRemixService,
        { provide: ConfigService, useValue: configMock },
        { provide: LoggerService, useValue: loggerMock },
        {
          provide: HttpService,
          useValue: { get: httpGetMock, post: httpPostMock },
        },
        {
          provide: IngredientsService,
          useValue: { findOne: ingredientsFindOneMock },
        },
      ],
    }).compile();

    service = module.get<HookRemixService>(HookRemixService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createHookRemix', () => {
    it('should create a hook remix and return queued status', async () => {
      ingredientsFindOneMock.mockResolvedValue(mockIngredient);
      httpPostMock.mockReturnValue(of({ data: { jobId: 'server-job-id' } }));

      const result = await service.createHookRemix(
        baseHookRemixDto,
        userId,
        organizationId,
      );

      expect(result).toEqual({
        hookDurationSeconds: 3,
        jobId: 'server-job-id',
        status: 'queued',
        youtubeUrl: baseHookRemixDto.youtubeUrl,
      });
    });

    it('should use default hookDurationSeconds of 3 when not provided', async () => {
      ingredientsFindOneMock.mockResolvedValue(mockIngredient);
      httpPostMock.mockReturnValue(of({ data: {} }));

      const result = await service.createHookRemix(
        { ...baseHookRemixDto },
        userId,
        organizationId,
      );

      expect(result.hookDurationSeconds).toBe(3);
    });

    it('should use custom hookDurationSeconds when provided', async () => {
      ingredientsFindOneMock.mockResolvedValue(mockIngredient);
      httpPostMock.mockReturnValue(of({ data: {} }));

      const result = await service.createHookRemix(
        { ...baseHookRemixDto, hookDurationSeconds: 7 },
        userId,
        organizationId,
      );

      expect(result.hookDurationSeconds).toBe(7);
    });

    it('should fall back to generated jobId when server returns none', async () => {
      ingredientsFindOneMock.mockResolvedValue(mockIngredient);
      httpPostMock.mockReturnValue(of({ data: {} }));

      const result = await service.createHookRemix(
        baseHookRemixDto,
        userId,
        organizationId,
      );

      expect(result.jobId).toBe('mock-uuid-1234');
    });

    it('should throw NotFoundException when CTA ingredient is not found', async () => {
      ingredientsFindOneMock.mockResolvedValue(null);

      await expect(
        service.createHookRemix(baseHookRemixDto, userId, organizationId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when ingredient has no cdnUrl', async () => {
      ingredientsFindOneMock.mockResolvedValue({
        ...mockIngredient,
        cdnUrl: null,
      });

      await expect(
        service.createHookRemix(baseHookRemixDto, userId, organizationId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should propagate HTTP errors', async () => {
      ingredientsFindOneMock.mockResolvedValue(mockIngredient);
      httpPostMock.mockReturnValue(
        throwError(() => new Error('Files service down')),
      );

      await expect(
        service.createHookRemix(baseHookRemixDto, userId, organizationId),
      ).rejects.toThrow('Files service down');
    });

    it('should post to the correct files service URL', async () => {
      ingredientsFindOneMock.mockResolvedValue(mockIngredient);
      httpPostMock.mockReturnValue(of({ data: {} }));

      await service.createHookRemix(baseHookRemixDto, userId, organizationId);

      expect(httpPostMock).toHaveBeenCalledWith(
        'http://localhost:3012/v1/files/process/hook-remix',
        expect.objectContaining({
          brandId,
          ctaVideoUrl: mockIngredient.cdnUrl,
          organizationId,
          userId,
          youtubeUrl: baseHookRemixDto.youtubeUrl,
        }),
      );
    });
  });

  describe('createBatchHookRemix', () => {
    const batchDto: CreateBatchHookRemixDto = {
      brandId,
      ctaIngredientId,
      labelPrefix: 'Remix',
      youtubeUrls: [
        'https://youtube.com/watch?v=abc',
        'https://youtube.com/watch?v=def',
      ],
    } as CreateBatchHookRemixDto;

    it('should queue all videos and return batch summary', async () => {
      ingredientsFindOneMock.mockResolvedValue(mockIngredient);
      httpPostMock.mockReturnValue(of({ data: { jobId: 'queued-id' } }));

      const result = await service.createBatchHookRemix(
        batchDto,
        userId,
        organizationId,
      );

      expect(result.total).toBe(2);
      expect(result.queued).toBe(2);
      expect(result.failed).toBe(0);
      expect(result.jobs).toHaveLength(2);
    });

    it('should include batchId in result', async () => {
      ingredientsFindOneMock.mockResolvedValue(mockIngredient);
      httpPostMock.mockReturnValue(of({ data: {} }));

      const result = await service.createBatchHookRemix(
        batchDto,
        userId,
        organizationId,
      );

      expect(result.batchId).toBe('mock-uuid-1234');
    });

    it('should label jobs with prefix and index', async () => {
      ingredientsFindOneMock.mockResolvedValue(mockIngredient);
      httpPostMock.mockReturnValue(of({ data: {} }));

      await service.createBatchHookRemix(batchDto, userId, organizationId);

      const [firstCall, secondCall] = httpPostMock.mock.calls as [
        [string, Record<string, unknown>],
        [string, Record<string, unknown>],
      ];
      expect(firstCall[1].label).toBe('Remix 1');
      expect(secondCall[1].label).toBe('Remix 2');
    });

    it('should mark individual jobs as failed when HTTP throws', async () => {
      ingredientsFindOneMock.mockResolvedValue(mockIngredient);
      httpPostMock
        .mockReturnValueOnce(of({ data: {} }))
        .mockReturnValueOnce(throwError(() => new Error('Timeout')));

      const result = await service.createBatchHookRemix(
        batchDto,
        userId,
        organizationId,
      );

      expect(result.queued).toBe(1);
      expect(result.failed).toBe(1);
      const failedJob = result.jobs.find((j) => j.status === 'failed');
      expect(failedJob?.error).toBe('Timeout');
    });

    it('should throw NotFoundException when CTA ingredient is not found', async () => {
      ingredientsFindOneMock.mockResolvedValue(null);

      await expect(
        service.createBatchHookRemix(batchDto, userId, organizationId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when ingredient has no cdnUrl', async () => {
      ingredientsFindOneMock.mockResolvedValue({
        ...mockIngredient,
        cdnUrl: '',
      });

      await expect(
        service.createBatchHookRemix(batchDto, userId, organizationId),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getJobStatus', () => {
    it('should return job status from files service', async () => {
      const mockStatus = {
        jobId: 'job-123',
        progress: 75,
        status: 'processing',
      };
      httpGetMock.mockReturnValue(of({ data: mockStatus }));

      const result = await service.getJobStatus('job-123');

      expect(result).toEqual(mockStatus);
      expect(httpGetMock).toHaveBeenCalledWith(
        'http://localhost:3012/v1/files/job/job-123',
      );
    });

    it('should throw when files service returns error', async () => {
      httpGetMock.mockReturnValue(throwError(() => new Error('Job not found')));

      await expect(service.getJobStatus('bad-job-id')).rejects.toThrow(
        'Job not found',
      );
      expect(loggerMock.error).toHaveBeenCalled();
    });
  });
});
