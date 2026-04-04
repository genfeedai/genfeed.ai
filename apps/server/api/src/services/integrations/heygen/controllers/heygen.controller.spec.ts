import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { HeyGenController } from '@api/services/integrations/heygen/controllers/heygen.controller';
import { HeyGenService } from '@api/services/integrations/heygen/services/heygen.service';
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

describe('HeyGenController', () => {
  let controller: HeyGenController;
  let heygenService: {
    getVoices: ReturnType<typeof vi.fn>;
    getAvatars: ReturnType<typeof vi.fn>;
  };
  let loggerService: {
    log: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    heygenService = {
      getAvatars: vi.fn().mockResolvedValue([]),
      getVoices: vi.fn().mockResolvedValue([]),
    };
    loggerService = {
      error: vi.fn(),
      log: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HeyGenController],
      providers: [
        { provide: LoggerService, useValue: loggerService },
        { provide: HeyGenService, useValue: heygenService },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<HeyGenController>(HeyGenController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // --- getVoices ---
  it('should return empty voices list when service returns empty array', async () => {
    const result = await controller.getVoices(mockUser);
    expect(result.data.type).toBe('voices');
    expect(result.data.attributes.provider).toBe('heygen');
    expect(result.data.attributes.count).toBe(0);
    expect(result.data.attributes.voices).toEqual([]);
  });

  it('should return mapped voices with correct shape', async () => {
    heygenService.getVoices.mockResolvedValue([
      {
        index: 0,
        name: 'Alice',
        preview: 'https://example.com/a.mp3',
        voiceId: 'v1',
      },
      { index: 1, name: 'Bob', preview: null, voiceId: 'v2' },
    ]);

    const result = await controller.getVoices(mockUser);
    expect(result.data.attributes.count).toBe(2);
    expect(result.data.attributes.voices).toEqual([
      {
        index: 0,
        name: 'Alice',
        preview: 'https://example.com/a.mp3',
        voiceId: 'v1',
      },
      { index: 1, name: 'Bob', preview: null, voiceId: 'v2' },
    ]);
  });

  it('should pass organization from user metadata to getVoices', async () => {
    await controller.getVoices(mockUser);
    expect(heygenService.getVoices).toHaveBeenCalledWith(
      '507f1f77bcf86cd799439013',
    );
  });

  it('should throw HttpException when getVoices fails', async () => {
    heygenService.getVoices.mockRejectedValue(new Error('API key invalid'));
    await expect(controller.getVoices(mockUser)).rejects.toThrow(HttpException);
    try {
      await controller.getVoices(mockUser);
    } catch (error) {
      const httpError = error as HttpException;
      expect(httpError.getStatus()).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      const response = httpError.getResponse() as Record<string, string>;
      expect(response.detail).toBe('API key invalid');
      expect(response.title).toBe('Failed to fetch HeyGen voices');
    }
  });

  // --- getAvatars ---
  it('should return mapped avatars with correct shape', async () => {
    heygenService.getAvatars.mockResolvedValue([
      { avatarId: 'a1', index: 0, name: 'Avatar1', preview: 'https://img.png' },
    ]);

    const result = await controller.getAvatars(mockUser);
    expect(result.data.type).toBe('avatars');
    expect(result.data.attributes.provider).toBe('heygen');
    expect(result.data.attributes.count).toBe(1);
    expect(result.data.attributes.avatars[0]).toEqual({
      avatarId: 'a1',
      index: 0,
      name: 'Avatar1',
      preview: 'https://img.png',
    });
  });

  it('should throw HttpException when getAvatars fails', async () => {
    heygenService.getAvatars.mockRejectedValue(new Error('timeout'));
    await expect(controller.getAvatars(mockUser)).rejects.toThrow(
      HttpException,
    );
  });

  // --- getStatus ---
  it('should return connected status when getVoices succeeds', async () => {
    heygenService.getVoices.mockResolvedValue([]);
    const result = await controller.getStatus(mockUser);
    expect(result.data.type).toBe('service-status');
    expect(result.data.attributes.isConnected).toBe(true);
    expect(result.data.attributes.hasCustomKey).toBe(true);
    expect(result.data.attributes.provider).toBe('heygen');
  });

  it('should throw HttpException when status check fails', async () => {
    heygenService.getVoices.mockRejectedValue(new Error('connection refused'));
    await expect(controller.getStatus(mockUser)).rejects.toThrow(HttpException);
    expect(loggerService.error).toHaveBeenCalled();
  });

  it('should log on every endpoint call', async () => {
    await controller.getVoices(mockUser);
    await controller.getAvatars(mockUser);
    await controller.getStatus(mockUser);
    expect(loggerService.log).toHaveBeenCalledTimes(3);
  });

  it('should handle unknown error message in getVoices', async () => {
    heygenService.getVoices.mockRejectedValue('string error');
    try {
      await controller.getVoices(mockUser);
    } catch (error) {
      const httpError = error as HttpException;
      const response = httpError.getResponse() as Record<string, string>;
      expect(response.detail).toBe('Unknown error occurred');
    }
  });
});
