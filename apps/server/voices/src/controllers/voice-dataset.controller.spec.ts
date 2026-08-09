import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigService } from '@voices/config/config.service';
import { VoiceDatasetController } from '@voices/controllers/voice-dataset.controller';
import type {
  VoiceDatasetInfo,
  VoiceDatasetSyncResult,
} from '@voices/interfaces/voice-dataset.interfaces';
import { VoiceDatasetService } from '@voices/services/voice-dataset.service';

describe('VoiceDatasetController', () => {
  let controller: VoiceDatasetController;
  let voiceDatasetService: {
    deleteDataset: ReturnType<typeof vi.fn>;
    getDatasetInfo: ReturnType<typeof vi.fn>;
    syncFromS3: ReturnType<typeof vi.fn>;
  };

  const syncResult: VoiceDatasetSyncResult = {
    downloaded: 2,
    errors: [],
    failed: 0,
    path: '/datasets/voice-1',
    voiceId: 'voice-1',
  };

  const datasetInfo: VoiceDatasetInfo = {
    path: '/datasets/voice-1',
    sampleCount: 2,
    samples: ['sample-1.wav', 'sample-2.wav'],
    totalDurationMs: 4200,
    voiceId: 'voice-1',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [VoiceDatasetController],
      providers: [
        {
          provide: VoiceDatasetService,
          useValue: {
            deleteDataset: vi.fn().mockResolvedValue({ deleted: true }),
            getDatasetInfo: vi.fn().mockResolvedValue(datasetInfo),
            syncFromS3: vi.fn().mockResolvedValue(syncResult),
          },
        },
        {
          provide: ConfigService,
          useValue: { API_KEY: 'test-api-key', isDevelopment: false },
        },
        { provide: LoggerService, useValue: { warn: vi.fn() } },
      ],
    }).compile();

    controller = module.get(VoiceDatasetController);
    voiceDatasetService = module.get(VoiceDatasetService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('syncDataset', () => {
    it('passes the voiceId param and body to the service', async () => {
      const body = { s3Keys: ['voices/voice-1/a.wav', 'voices/voice-1/b.wav'] };

      const result = await controller.syncDataset('voice-1', body);

      expect(voiceDatasetService.syncFromS3).toHaveBeenCalledWith(
        'voice-1',
        body,
      );
      expect(result).toEqual(syncResult);
    });

    it('propagates service errors', async () => {
      voiceDatasetService.syncFromS3.mockRejectedValue(
        new BadRequestException('Invalid voiceId'),
      );

      await expect(
        controller.syncDataset('../evil', { s3Keys: [] }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getDatasetInfo', () => {
    it('retrieves dataset info for a voice', async () => {
      const result = await controller.getDatasetInfo('voice-1');

      expect(voiceDatasetService.getDatasetInfo).toHaveBeenCalledWith(
        'voice-1',
      );
      expect(result).toEqual(datasetInfo);
    });

    it('returns an empty dataset when nothing has been synced', async () => {
      voiceDatasetService.getDatasetInfo.mockResolvedValue({
        ...datasetInfo,
        sampleCount: 0,
        samples: [],
        totalDurationMs: 0,
      });

      const result = await controller.getDatasetInfo('voice-1');

      expect(result).toMatchObject({ sampleCount: 0, samples: [] });
    });
  });

  describe('deleteDataset', () => {
    it('delegates to VoiceDatasetService.deleteDataset', async () => {
      const result = await controller.deleteDataset('voice-1');

      expect(voiceDatasetService.deleteDataset).toHaveBeenCalledWith('voice-1');
      expect(result).toEqual({ deleted: true });
    });

    it('propagates service errors', async () => {
      voiceDatasetService.deleteDataset.mockRejectedValue(
        new BadRequestException('Invalid voiceId'),
      );

      await expect(controller.deleteDataset('../evil')).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
