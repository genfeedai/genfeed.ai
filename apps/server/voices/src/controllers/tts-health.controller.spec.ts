import { Test, TestingModule } from '@nestjs/testing';
import { TtsHealthController } from '@voices/controllers/tts-health.controller';
import { TTSInferenceService } from '@voices/services/tts-inference.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('TtsHealthController', () => {
  let controller: TtsHealthController;
  let mockTTSInferenceService: {
    getStatus: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    mockTTSInferenceService = {
      getStatus: vi
        .fn()
        .mockResolvedValue({ modelLoaded: true, status: 'online' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TtsHealthController],
      providers: [
        { provide: TTSInferenceService, useValue: mockTTSInferenceService },
      ],
    }).compile();

    controller = module.get(TtsHealthController);
  });

  describe('ttsHealth', () => {
    it('returns service name "tts-inference"', async () => {
      const result = await controller.ttsHealth();

      expect(result.service).toBe('tts-inference');
    });

    it('includes status from TTSInferenceService', async () => {
      const result = await controller.ttsHealth();

      expect(mockTTSInferenceService.getStatus).toHaveBeenCalled();
      expect(result.status).toBe('online');
      expect((result as { modelLoaded: boolean }).modelLoaded).toBe(true);
    });

    it('includes timestamp in response', async () => {
      const result = await controller.ttsHealth();

      expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('handles offline TTS status gracefully', async () => {
      mockTTSInferenceService.getStatus.mockResolvedValueOnce({
        modelLoaded: false,
        status: 'offline',
      });

      const result = await controller.ttsHealth();

      expect(result.status).toBe('offline');
      expect((result as { modelLoaded: boolean }).modelLoaded).toBe(false);
    });
  });
});
