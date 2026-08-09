import { LoggerService } from '@libs/logger/logger.service';
import { NotFoundException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigService } from '@voices/config/config.service';
import { VoiceCloneController } from '@voices/controllers/voice-clone.controller';
import type {
  VoiceCloneListResult,
  VoiceCloneUploadResult,
} from '@voices/interfaces/voice-clone.interfaces';
import { VoiceCloneService } from '@voices/services/voice-clone.service';

describe('VoiceCloneController', () => {
  let controller: VoiceCloneController;
  let voiceCloneService: {
    listClones: ReturnType<typeof vi.fn>;
    uploadClone: ReturnType<typeof vi.fn>;
  };

  const uploadResult: VoiceCloneUploadResult = {
    s3Key: 'voices/clones/voice-1.pth',
    uploaded: true,
    voiceId: 'voice-1',
  };

  const listResult: VoiceCloneListResult = {
    clones: [
      {
        filename: 'voice-1.pth',
        path: '/models/voices/voice-1.pth',
        source: 'local',
        voiceId: 'voice-1',
      },
      {
        filename: 'voice-2.pth',
        s3Key: 'voices/clones/voice-2.pth',
        source: 's3',
        voiceId: 'voice-2',
      },
    ],
    total: 2,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [VoiceCloneController],
      providers: [
        {
          provide: VoiceCloneService,
          useValue: {
            listClones: vi.fn().mockResolvedValue(listResult),
            uploadClone: vi.fn().mockResolvedValue(uploadResult),
          },
        },
        {
          provide: ConfigService,
          useValue: { API_KEY: 'test-api-key', isDevelopment: false },
        },
        { provide: LoggerService, useValue: { warn: vi.fn() } },
      ],
    }).compile();

    controller = module.get(VoiceCloneController);
    voiceCloneService = module.get(VoiceCloneService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('uploadClone', () => {
    it('delegates to VoiceCloneService.uploadClone', async () => {
      const body = {
        localPath: '/models/voices/voice-1.pth',
        voiceId: 'voice-1',
      };

      const result = await controller.uploadClone(body);

      expect(voiceCloneService.uploadClone).toHaveBeenCalledWith(body);
      expect(result).toEqual(uploadResult);
    });

    it('propagates service errors', async () => {
      voiceCloneService.uploadClone.mockRejectedValue(
        new NotFoundException('Clone model not found'),
      );

      await expect(
        controller.uploadClone({ localPath: '/missing.pth', voiceId: 'ghost' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('listClones', () => {
    it('returns local and S3 clones', async () => {
      const result = await controller.listClones();

      expect(voiceCloneService.listClones).toHaveBeenCalledTimes(1);
      expect(result).toEqual(listResult);
    });

    it('returns an empty list when no clones exist', async () => {
      voiceCloneService.listClones.mockResolvedValue({ clones: [], total: 0 });

      const result = await controller.listClones();

      expect(result).toEqual({ clones: [], total: 0 });
    });
  });
});
