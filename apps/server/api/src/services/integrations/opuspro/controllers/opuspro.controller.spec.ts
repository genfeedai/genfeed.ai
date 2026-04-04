vi.mock('@api/helpers/utils/clerk/clerk.util', () => ({
  getPublicMetadata: vi.fn(() => ({
    organization: '507f1f77bcf86cd799439011',
    user: '507f1f77bcf86cd799439013',
  })),
}));

import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import { OpusProController } from '@api/services/integrations/opuspro/controllers/opuspro.controller';
import { OpusProService } from '@api/services/integrations/opuspro/services/opuspro.service';
import type { User } from '@clerk/backend';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException, HttpStatus } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';

vi.mock('@libs/utils/caller/caller.util', () => ({
  CallerUtil: { getCallerName: vi.fn(() => 'testMethod') },
}));

describe('OpusProController', () => {
  let controller: OpusProController;
  let opusProService: {
    generateVideo: ReturnType<typeof vi.fn>;
    getAccountInfo: ReturnType<typeof vi.fn>;
    getTemplates: ReturnType<typeof vi.fn>;
    getVideoStatus: ReturnType<typeof vi.fn>;
  };
  let loggerService: {
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
  };

  const mockUser = {
    publicMetadata: {
      organization: '507f1f77bcf86cd799439011',
      user: '507f1f77bcf86cd799439013',
    },
  } as unknown as User;

  beforeEach(async () => {
    opusProService = {
      generateVideo: vi.fn(),
      getAccountInfo: vi.fn(),
      getTemplates: vi.fn(),
      getVideoStatus: vi.fn(),
    };
    loggerService = { error: vi.fn(), log: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OpusProController],
      providers: [
        { provide: OpusProService, useValue: opusProService },
        { provide: LoggerService, useValue: loggerService },
      ],
    }).compile();

    controller = module.get(OpusProController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getStatus', () => {
    it('should return isConnected=true when getAccountInfo succeeds', async () => {
      opusProService.getAccountInfo.mockResolvedValue({ plan: 'pro' });

      const result = await controller.getStatus(mockUser);

      expect(result.data.type).toBe('service-status');
      expect(result.data.attributes.isConnected).toBe(true);
      expect(result.data.attributes.provider).toBe('opuspro');
    });

    it('should return isConnected=false when getAccountInfo throws', async () => {
      opusProService.getAccountInfo.mockRejectedValue(new Error('auth fail'));

      const result = await controller.getStatus(mockUser);

      expect(result.data.attributes.isConnected).toBe(false);
    });

    it('should throw HttpException on unexpected outer error', async () => {
      vi.mocked(getPublicMetadata).mockImplementationOnce(() => {
        throw new Error('clerk failure');
      });

      await expect(controller.getStatus(mockUser)).rejects.toThrow(
        HttpException,
      );
    });
  });

  describe('getTemplates', () => {
    it('should return formatted templates response', async () => {
      const templates = [
        {
          description: 'desc',
          name: 'Tpl 1',
          preview: 'url',
          templateId: 't1',
        },
      ];
      opusProService.getTemplates.mockResolvedValue(templates);

      const result = await controller.getTemplates(mockUser);

      expect(result.data.type).toBe('templates');
      expect(result.data.attributes.templates).toEqual(templates);
      expect(result.data.attributes.count).toBe(1);
      expect(result.data.attributes.provider).toBe('opuspro');
    });

    it('should throw HttpException when service throws', async () => {
      opusProService.getTemplates.mockRejectedValue(new Error('API down'));

      await expect(controller.getTemplates(mockUser)).rejects.toMatchObject({
        status: HttpStatus.INTERNAL_SERVER_ERROR,
      });
    });

    it('should pass organizationId from clerk metadata to service', async () => {
      opusProService.getTemplates.mockResolvedValue([]);

      await controller.getTemplates(mockUser);

      expect(opusProService.getTemplates).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439011',
      );
    });
  });

  describe('generateVideo', () => {
    it('should return video-generation response with videoId', async () => {
      opusProService.generateVideo.mockResolvedValue('vid-999');

      const result = await controller.generateVideo(mockUser, {
        params: { speed: 1 },
        templateId: 'tpl-a',
      });

      expect(result.data.type).toBe('video-generation');
      expect(result.data.attributes.videoId).toBe('vid-999');
      expect(result.data.attributes.status).toBe('processing');
      expect(result.data.attributes.provider).toBe('opuspro');
    });

    it('should use empty object when params not provided', async () => {
      opusProService.generateVideo.mockResolvedValue('vid-000');

      const result = await controller.generateVideo(mockUser, {
        templateId: 'tpl-b',
      });

      expect(result.data.attributes.videoId).toBe('vid-000');
      expect(opusProService.generateVideo).toHaveBeenCalledWith(
        '',
        'tpl-b',
        {},
        expect.any(String),
        expect.any(String),
      );
    });

    it('should throw HttpException when generateVideo fails', async () => {
      opusProService.generateVideo.mockRejectedValue(
        new Error('quota exceeded'),
      );

      await expect(
        controller.generateVideo(mockUser, { templateId: 'tpl-err' }),
      ).rejects.toMatchObject({ status: HttpStatus.INTERNAL_SERVER_ERROR });
    });
  });

  describe('getVideoStatus', () => {
    it('should return video-status with all fields', async () => {
      opusProService.getVideoStatus.mockResolvedValue({
        progress: 100,
        status: 'completed',
        videoUrl: 'https://cdn/v.mp4',
      });

      const result = await controller.getVideoStatus(mockUser, 'vid-abc');

      expect(result.data.type).toBe('video-status');
      expect(result.data.attributes.status).toBe('completed');
      expect(result.data.attributes.videoUrl).toBe('https://cdn/v.mp4');
      expect(result.data.attributes.provider).toBe('opuspro');
    });

    it('should pass videoId parameter to service', async () => {
      opusProService.getVideoStatus.mockResolvedValue({ status: 'pending' });

      await controller.getVideoStatus(mockUser, 'vid-xyz');

      expect(opusProService.getVideoStatus).toHaveBeenCalledWith(
        'vid-xyz',
        expect.any(String),
      );
    });

    it('should throw HttpException on service error', async () => {
      opusProService.getVideoStatus.mockRejectedValue(new Error('not found'));

      await expect(
        controller.getVideoStatus(mockUser, 'bad-id'),
      ).rejects.toMatchObject({ status: HttpStatus.INTERNAL_SERVER_ERROR });
    });
  });
});
