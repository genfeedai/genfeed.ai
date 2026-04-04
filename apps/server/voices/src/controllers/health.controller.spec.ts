import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from '@voices/controllers/health.controller';
import { JobService } from '@voices/services/job.service';
import { TTSInferenceService } from '@voices/services/tts-inference.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('HealthController', () => {
  let controller: HealthController;
  let mockTTSInferenceService: {
    getStatus: ReturnType<typeof vi.fn>;
  };
  let mockJobService: {
    getStats: ReturnType<typeof vi.fn>;
  };

  const mockJobStats = {
    active: 2,
    completed: 150,
    failed: 3,
    queued: 5,
    total: 160,
  };

  beforeEach(async () => {
    mockTTSInferenceService = {
      getStatus: vi
        .fn()
        .mockResolvedValue({ modelLoaded: true, status: 'online' }),
    };

    mockJobService = {
      getStats: vi.fn().mockReturnValue(mockJobStats),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: TTSInferenceService, useValue: mockTTSInferenceService },
        { provide: JobService, useValue: mockJobService },
      ],
    }).compile();

    controller = module.get(HealthController);
  });

  describe('getHealth', () => {
    it('returns service name as "voices"', () => {
      const result = controller.getHealth();

      expect(result.service).toBe('voices');
    });

    it('returns status "ok"', () => {
      const result = controller.getHealth();

      expect(result.status).toBe('ok');
    });

    it('includes job stats from JobService', () => {
      const result = controller.getHealth();

      expect(mockJobService.getStats).toHaveBeenCalled();
      expect(result.jobs).toEqual(mockJobStats);
    });

    it('includes memory usage fields', () => {
      const result = controller.getHealth();

      expect(result.memory).toHaveProperty('heapTotal');
      expect(result.memory).toHaveProperty('heapUsed');
      expect(result.memory).toHaveProperty('rss');
      expect(typeof result.memory.heapTotal).toBe('number');
      expect(typeof result.memory.heapUsed).toBe('number');
      expect(typeof result.memory.rss).toBe('number');
    });

    it('includes uptime as a number', () => {
      const result = controller.getHealth();

      expect(typeof result.uptime).toBe('number');
    });

    it('includes timestamp as ISO string', () => {
      const result = controller.getHealth();

      expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
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

    it('does not call JobService.getStats for TTS health check', async () => {
      await controller.ttsHealth();

      expect(mockJobService.getStats).not.toHaveBeenCalled();
    });
  });
});
