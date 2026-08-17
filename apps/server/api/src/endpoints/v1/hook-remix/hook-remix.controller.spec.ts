import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import {
  CreateBatchHookRemixDto,
  CreateHookRemixDto,
} from '@api/endpoints/v1/hook-remix/dto/create-hook-remix.dto';
import { HookRemixController } from '@api/endpoints/v1/hook-remix/hook-remix.controller';
import { HookRemixService } from '@api/endpoints/v1/hook-remix/hook-remix.service';
import { testId } from '@helpers/testing/test-id.helper';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException, HttpStatus } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@api/helpers/decorators/swagger/auto-swagger.decorator', () => ({
  AutoSwagger: () => (target: unknown) => target,
}));

vi.mock('@api/helpers/decorators/user/current-user.decorator', () => ({
  CurrentUser:
    () => (_target: unknown, _key: string, descriptor: PropertyDescriptor) =>
      descriptor,
}));

describe('HookRemixController', () => {
  const orgId = testId('org');
  const userId = testId('user');

  let controller: HookRemixController;
  let hookRemixService: {
    createBatchHookRemix: ReturnType<typeof vi.fn>;
    createHookRemix: ReturnType<typeof vi.fn>;
    getJob: ReturnType<typeof vi.fn>;
  };
  let logger: {
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };

  const mockUser = {
    id: 'authProvider_user_1',
    isSuperAdmin: false,
    organizationId: orgId,
    userId: userId,
  } as unknown as User;

  beforeEach(async () => {
    hookRemixService = {
      createBatchHookRemix: vi.fn(),
      createHookRemix: vi.fn(),
      getJob: vi.fn(),
    };
    logger = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };

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

    it('should extract org and user from canonical identity fields', async () => {
      hookRemixService.createHookRemix.mockResolvedValue({ jobId: 'j1' });

      await controller.createHookRemix(dto, mockUser);

      expect(hookRemixService.createHookRemix).toHaveBeenCalledWith(
        dto,
        userId,
        orgId,
      );
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

  describe('getJob', () => {
    const jobId = 'job_status_test';

    it('should return job from service', async () => {
      const job = { jobId, progress: 50, status: 'running' };
      hookRemixService.getJob.mockResolvedValue(job);

      const result = await controller.getJob(jobId);

      expect(hookRemixService.getJob).toHaveBeenCalledWith(jobId);
      expect(result).toEqual(job);
    });

    it('should rethrow HttpException from getJob', async () => {
      hookRemixService.getJob.mockRejectedValue(
        new HttpException('Not found', HttpStatus.NOT_FOUND),
      );

      await expect(controller.getJob(jobId)).rejects.toThrow(HttpException);
    });

    it('should wrap unexpected errors as HttpException via ErrorResponse.handle', async () => {
      hookRemixService.getJob.mockRejectedValue(new Error('Job exploded'));

      await expect(controller.getJob(jobId)).rejects.toThrow(HttpException);
      expect(logger.error).toHaveBeenCalled();
    });

    it('should call service exactly once with the provided jobId', async () => {
      hookRemixService.getJob.mockResolvedValue({ status: 'done' });

      await controller.getJob(jobId);

      expect(hookRemixService.getJob).toHaveBeenCalledOnce();
      expect(hookRemixService.getJob).toHaveBeenCalledWith(jobId);
    });
  });
});
