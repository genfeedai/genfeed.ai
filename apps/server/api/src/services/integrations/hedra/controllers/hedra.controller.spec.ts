import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { HedraController } from '@api/services/integrations/hedra/controllers/hedra.controller';
import { HedraService } from '@api/services/integrations/hedra/services/hedra.service';
import type { User } from '@clerk/backend';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException, HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

const mockUser = {
  id: 'user_abc',
  publicMetadata: {
    brand: '507f1f77bcf86cd799439014',
    organization: '507f1f77bcf86cd799439013',
    user: '507f1f77bcf86cd799439012',
  },
} as unknown as User;

describe('HedraController', () => {
  let controller: HedraController;
  let hedraService: {
    getVoices: ReturnType<typeof vi.fn>;
    getAvatars: ReturnType<typeof vi.fn>;
    getJobStatus: ReturnType<typeof vi.fn>;
  };
  let loggerService: {
    log: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    hedraService = {
      getAvatars: vi.fn().mockResolvedValue([]),
      getJobStatus: vi.fn().mockResolvedValue({ status: 'pending' }),
      getVoices: vi.fn().mockResolvedValue([]),
    };
    loggerService = { error: vi.fn(), log: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HedraController],
      providers: [
        { provide: LoggerService, useValue: loggerService },
        { provide: HedraService, useValue: hedraService },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<HedraController>(HedraController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // --- getVoices ---
  it('should return voices with provider hedra', async () => {
    hedraService.getVoices.mockResolvedValue([{ id: 'v1', name: 'TestVoice' }]);
    const result = await controller.getVoices(mockUser);
    expect(result.data.type).toBe('voices');
    expect(result.data.attributes.provider).toBe('hedra');
    expect(result.data.attributes.count).toBe(1);
    expect(result.data.attributes.voices).toEqual([
      { id: 'v1', name: 'TestVoice' },
    ]);
  });

  it('should pass organization to getVoices', async () => {
    await controller.getVoices(mockUser);
    expect(hedraService.getVoices).toHaveBeenCalledWith(
      '507f1f77bcf86cd799439013',
    );
  });

  it('should throw HttpException when getVoices fails', async () => {
    hedraService.getVoices.mockRejectedValue(new Error('Network error'));
    await expect(controller.getVoices(mockUser)).rejects.toThrow(HttpException);
    expect(loggerService.error).toHaveBeenCalled();
  });

  // --- getAvatars ---
  it('should return avatars with correct count', async () => {
    hedraService.getAvatars.mockResolvedValue([{ id: 'a1' }, { id: 'a2' }]);
    const result = await controller.getAvatars(mockUser);
    expect(result.data.type).toBe('avatars');
    expect(result.data.attributes.provider).toBe('hedra');
    expect(result.data.attributes.count).toBe(2);
  });

  it('should throw HttpException when getAvatars fails', async () => {
    hedraService.getAvatars.mockRejectedValue(new Error('bad request'));
    await expect(controller.getAvatars(mockUser)).rejects.toThrow(
      HttpException,
    );
  });

  // --- getJobStatus ---
  it('should return job status with jobId in attributes', async () => {
    hedraService.getJobStatus.mockResolvedValue({
      status: 'completed',
      url: 'https://vid.mp4',
    });
    const result = await controller.getJobStatus('job-42', mockUser);
    expect(result.data.type).toBe('job-status');
    expect(result.data.attributes.jobId).toBe('job-42');
    expect(result.data.attributes.status).toBe('completed');
    expect(result.data.attributes.url).toBe('https://vid.mp4');
  });

  it('should pass jobId and organization to getJobStatus', async () => {
    await controller.getJobStatus('job-99', mockUser);
    expect(hedraService.getJobStatus).toHaveBeenCalledWith(
      'job-99',
      '507f1f77bcf86cd799439013',
    );
  });

  it('should throw HttpException when getJobStatus fails', async () => {
    hedraService.getJobStatus.mockRejectedValue(new Error('not found'));
    await expect(controller.getJobStatus('bad-id', mockUser)).rejects.toThrow(
      HttpException,
    );
    try {
      await controller.getJobStatus('bad-id', mockUser);
    } catch (error) {
      const httpError = error as HttpException;
      expect(httpError.getStatus()).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      const response = httpError.getResponse() as Record<string, string>;
      expect(response.title).toBe('Failed to fetch job status');
    }
  });

  // --- getStatus ---
  it('should return connected status when voices call succeeds', async () => {
    const result = await controller.getStatus(mockUser);
    expect(result.data.type).toBe('service-status');
    expect(result.data.attributes.isConnected).toBe(true);
    expect(result.data.attributes.provider).toBe('hedra');
  });

  it('should throw HttpException when status check fails', async () => {
    hedraService.getVoices.mockRejectedValue(new Error('refused'));
    await expect(controller.getStatus(mockUser)).rejects.toThrow(HttpException);
  });

  it('should handle unknown error type gracefully', async () => {
    hedraService.getVoices.mockRejectedValue(42);
    try {
      await controller.getVoices(mockUser);
    } catch (error) {
      const httpError = error as HttpException;
      const response = httpError.getResponse() as Record<string, string>;
      expect(response.detail).toBe('Unknown error occurred');
    }
  });
});
