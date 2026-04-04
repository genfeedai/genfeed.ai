import {
  CreateBatchHookRemixDto,
  CreateHookRemixDto,
} from '@api/endpoints/v1/hook-remix/dto/create-hook-remix.dto';
import { HookRemixController } from '@api/endpoints/v1/hook-remix/hook-remix.controller';
import { HookRemixService } from '@api/endpoints/v1/hook-remix/hook-remix.service';
import type { User } from '@clerk/backend';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException, HttpStatus } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@api/helpers/decorators/swagger/auto-swagger.decorator', () => ({
  AutoSwagger: () => (target: unknown) => target,
}));

vi.mock('@api/helpers/decorators/user/current-user.decorator', () => ({
  CurrentUser:
    () => (_target: unknown, _key: string, descriptor: PropertyDescriptor) =>
      descriptor,
}));

vi.mock('@api/helpers/utils/clerk/clerk.util', () => ({
  getPublicMetadata: vi.fn().mockReturnValue({
    organization: '507f1f77bcf86cd799439011',
    user: '507f1f77bcf86cd799439012',
  }),
}));

describe('HookRemixController', () => {
  const orgId = new Types.ObjectId().toString();
  const userId = new Types.ObjectId().toString();

  let controller: HookRemixController;
  let hookRemixService: {
    createBatchHookRemix: ReturnType<typeof vi.fn>;
    createHookRemix: ReturnType<typeof vi.fn>;
    getJobStatus: ReturnType<typeof vi.fn>;
  };
  let logger: {
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };

  const mockUser = {
    id: 'clerk_user_1',
    publicMetadata: { organization: orgId, user: userId },
  } as unknown as User;

  beforeEach(async () => {
    hookRemixService = {
      createBatchHookRemix: vi.fn(),
      createHookRemix: vi.fn(),
      getJobStatus: vi.fn(),
    };
    logger = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };

    const { getPublicMetadata } = await import(
      '@api/helpers/utils/clerk/clerk.util'
    );
    (getPublicMetadata as ReturnType<typeof vi.fn>).mockReturnValue({
      organization: orgId,
      user: userId,
    });

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HookRemixController],
      providers: [
        { provide: HookRemixService, useValue: hookRemixService },
        { provide: LoggerService, useValue: logger },
      ],
    }).compile();

    controller = module.get(HookRemixController);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('createHookRemix', () => {
    const dto = {
      hookText: 'This hook slaps',
      platform: 'tiktok',
    } as unknown as CreateHookRemixDto;

    it('should call service.createHookRemix with dto, userId, orgId', async () => {
      const serviceResult = { jobId: 'job_abc', status: 'queued' };
      hookRemixService.createHookRemix.mockResolvedValue(serviceResult);

      const result = await controller.createHookRemix(dto, mockUser);

      expect(hookRemixService.createHookRemix).toHaveBeenCalledWith(
        dto,
        userId,
        orgId,
      );
      expect(result).toEqual(serviceResult);
    });

    it('should rethrow HttpException as-is (not wrap it)', async () => {
      hookRemixService.createHookRemix.mockRejectedValue(
        new HttpException('Conflict', HttpStatus.CONFLICT),
      );

      await expect(controller.createHookRemix(dto, mockUser)).rejects.toThrow(
        HttpException,
      );
    });

    it('should throw HttpException for unexpected errors via ErrorResponse.handle', async () => {
      hookRemixService.createHookRemix.mockRejectedValue(
        new Error('Unexpected failure'),
      );

      await expect(controller.createHookRemix(dto, mockUser)).rejects.toThrow(
        HttpException,
      );
      expect(logger.error).toHaveBeenCalled();
    });

    it('should extract org and user from Clerk public metadata', async () => {
      hookRemixService.createHookRemix.mockResolvedValue({ jobId: 'j1' });
      const { getPublicMetadata } = await import(
        '@api/helpers/utils/clerk/clerk.util'
      );

      await controller.createHookRemix(dto, mockUser);

      expect(getPublicMetadata).toHaveBeenCalledWith(mockUser);
    });
  });

  describe('createBatchHookRemix', () => {
    const batchDto = {
      hooks: [
        { hookText: 'Hook 1', platform: 'instagram' },
        { hookText: 'Hook 2', platform: 'tiktok' },
      ],
    } as unknown as CreateBatchHookRemixDto;

    it('should call service.createBatchHookRemix with batchDto, userId, orgId', async () => {
      const serviceResult = [{ jobId: 'job_1' }, { jobId: 'job_2' }];
      hookRemixService.createBatchHookRemix.mockResolvedValue(serviceResult);

      const result = await controller.createBatchHookRemix(batchDto, mockUser);

      expect(hookRemixService.createBatchHookRemix).toHaveBeenCalledWith(
        batchDto,
        userId,
        orgId,
      );
      expect(result).toEqual(serviceResult);
    });

    it('should rethrow HttpException as-is', async () => {
      hookRemixService.createBatchHookRemix.mockRejectedValue(
        new HttpException('Too many requests', HttpStatus.TOO_MANY_REQUESTS),
      );

      await expect(
        controller.createBatchHookRemix(batchDto, mockUser),
      ).rejects.toThrow(HttpException);
    });

    it('should throw HttpException for unexpected errors via ErrorResponse.handle', async () => {
      hookRemixService.createBatchHookRemix.mockRejectedValue(
        new Error('Network issue'),
      );

      await expect(
        controller.createBatchHookRemix(batchDto, mockUser),
      ).rejects.toThrow(HttpException);
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('getJobStatus', () => {
    const jobId = 'job_status_test';

    it('should return job status from service', async () => {
      const status = { jobId, progress: 50, status: 'running' };
      hookRemixService.getJobStatus.mockResolvedValue(status);

      const result = await controller.getJobStatus(jobId);

      expect(hookRemixService.getJobStatus).toHaveBeenCalledWith(jobId);
      expect(result).toEqual(status);
    });

    it('should rethrow HttpException from getJobStatus', async () => {
      hookRemixService.getJobStatus.mockRejectedValue(
        new HttpException('Not found', HttpStatus.NOT_FOUND),
      );

      await expect(controller.getJobStatus(jobId)).rejects.toThrow(
        HttpException,
      );
    });

    it('should wrap unexpected errors as HttpException via ErrorResponse.handle', async () => {
      hookRemixService.getJobStatus.mockRejectedValue(
        new Error('Job exploded'),
      );

      await expect(controller.getJobStatus(jobId)).rejects.toThrow(
        HttpException,
      );
      expect(logger.error).toHaveBeenCalled();
    });

    it('should call service exactly once with the provided jobId', async () => {
      hookRemixService.getJobStatus.mockResolvedValue({ status: 'done' });

      await controller.getJobStatus(jobId);

      expect(hookRemixService.getJobStatus).toHaveBeenCalledOnce();
      expect(hookRemixService.getJobStatus).toHaveBeenCalledWith(jobId);
    });
  });
});
