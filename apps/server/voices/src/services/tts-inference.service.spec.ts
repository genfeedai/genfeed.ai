import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock axios before imports
const mockAxiosGet = vi.fn();
const mockAxiosPost = vi.fn();

vi.mock('axios', () => ({
  default: {
    get: (...args: unknown[]) => mockAxiosGet(...args),
    post: (...args: unknown[]) => mockAxiosPost(...args),
  },
}));

vi.mock('@libs/utils/caller/caller.util', () => ({
  CallerUtil: {
    getCallerName: vi.fn().mockReturnValue('testCaller'),
  },
}));

import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@voices/config/config.service';
import { TTSInferenceService } from '@voices/services/tts-inference.service';

describe('TTSInferenceService', () => {
  let service: TTSInferenceService;
  let mockLoggerService: {
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };

  const mockConfigService = {
    TTS_INFERENCE_URL: 'http://tts-inference:8080',
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    mockLoggerService = {
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TTSInferenceService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: LoggerService, useValue: mockLoggerService },
      ],
    }).compile();

    service = module.get<TTSInferenceService>(TTSInferenceService);
  });

  describe('getStatus', () => {
    it('should return online status when inference server is healthy and model is loaded', async () => {
      mockAxiosGet.mockResolvedValue({
        data: {
          gpu: 'Tesla T4',
          model_loaded: true,
          status: 'ok',
          uptime_seconds: 3600,
        },
      });

      const result = await service.getStatus();

      expect(result).toEqual({ modelLoaded: true, status: 'online' });
      expect(mockAxiosGet).toHaveBeenCalledWith(
        'http://tts-inference:8080/health',
        { timeout: 5000 },
      );
    });

    it('should return online status with modelLoaded false when model not loaded', async () => {
      mockAxiosGet.mockResolvedValue({
        data: {
          gpu: 'none',
          model_loaded: false,
          status: 'starting',
          uptime_seconds: 5,
        },
      });

      const result = await service.getStatus();

      expect(result).toEqual({ modelLoaded: false, status: 'online' });
    });

    it('should return offline status when request fails', async () => {
      mockAxiosGet.mockRejectedValue(new Error('ECONNREFUSED'));

      const result = await service.getStatus();

      expect(result).toEqual({ modelLoaded: false, status: 'offline' });
    });

    it('should log warning when inference is offline', async () => {
      mockAxiosGet.mockRejectedValue(new Error('ECONNREFUSED'));

      await service.getStatus();

      expect(mockLoggerService.warn).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          message: 'TTS inference is offline',
          url: 'http://tts-inference:8080',
        }),
      );
    });

    it('should return offline on timeout', async () => {
      mockAxiosGet.mockRejectedValue({
        code: 'ECONNABORTED',
        message: 'timeout',
      });

      const result = await service.getStatus();

      expect(result.status).toBe('offline');
      expect(result.modelLoaded).toBe(false);
    });
  });

  describe('generateSpeech', () => {
    it('should call axios.post with correct params and return buffer', async () => {
      const audioData = Buffer.from('fake-audio-data');
      mockAxiosPost.mockResolvedValue({ data: audioData.buffer });

      const result = await service.generateSpeech({ text: 'Hello world' });

      expect(mockAxiosPost).toHaveBeenCalledWith(
        'http://tts-inference:8080/generate',
        {
          reference_audio_path: undefined,
          reference_text: undefined,
          text: 'Hello world',
        },
        { responseType: 'arraybuffer', timeout: 120000 },
      );
      expect(result).toBeInstanceOf(Buffer);
    });

    it('should include reference audio params when provided', async () => {
      mockAxiosPost.mockResolvedValue({ data: Buffer.from('audio').buffer });

      await service.generateSpeech({
        referenceAudioPath: '/data/sample.wav',
        referenceText: 'Reference text',
        text: 'Hello world',
      });

      expect(mockAxiosPost).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          reference_audio_path: '/data/sample.wav',
          reference_text: 'Reference text',
        }),
        expect.any(Object),
      );
    });

    it('should log before generating speech', async () => {
      mockAxiosPost.mockResolvedValue({ data: Buffer.from('').buffer });

      await service.generateSpeech({ text: 'Test text' });

      expect(mockLoggerService.log).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          message: 'Generating speech',
          textLength: 9,
        }),
      );
    });

    it('should log after successful speech generation', async () => {
      const audioData = Buffer.from('fake-audio');
      mockAxiosPost.mockResolvedValue({ data: audioData.buffer });

      await service.generateSpeech({ text: 'Test' });

      expect(mockLoggerService.log).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          message: 'Speech generated',
          sizeBytes: expect.any(Number),
        }),
      );
    });

    it('should propagate error when axios.post fails', async () => {
      mockAxiosPost.mockRejectedValue(new Error('Inference error'));

      await expect(service.generateSpeech({ text: 'Test' })).rejects.toThrow(
        'Inference error',
      );
    });

    it('should indicate whether reference audio was provided in log', async () => {
      mockAxiosPost.mockResolvedValue({ data: Buffer.from('').buffer });

      await service.generateSpeech({
        referenceAudioPath: '/data/ref.wav',
        text: 'Clone voice',
      });

      expect(mockLoggerService.log).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ hasReference: true }),
      );
    });
  });
});
