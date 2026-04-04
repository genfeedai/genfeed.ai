import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@voices/config/config.service';
import { JobService } from '@voices/services/job.service';
import { TTSService } from '@voices/services/tts.service';
import { TTSInferenceService } from '@voices/services/tts-inference.service';
import type { Mocked } from 'vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('axios');

import axios from 'axios';

const mockedAxios = axios as unknown as {
  post: ReturnType<typeof vi.fn>;
};

describe('TTSService', () => {
  let service: TTSService;
  let configService: Mocked<ConfigService>;
  let loggerService: Mocked<LoggerService>;
  let jobService: Mocked<JobService>;
  let ttsInferenceService: Mocked<TTSInferenceService>;

  const mockJob = {
    createdAt: new Date().toISOString(),
    jobId: 'job-abc-123',
    params: {},
    status: 'queued' as const,
    type: 'tts',
  };

  beforeEach(async () => {
    const mockConfigService = {
      FILES_SERVICE_URL: 'http://files.local:3000',
    } as unknown as Mocked<ConfigService>;

    const mockLoggerService = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    } as unknown as Mocked<LoggerService>;

    const mockJobService = {
      createJob: vi.fn().mockResolvedValue(mockJob),
      getJob: vi.fn(),
      updateJob: vi.fn().mockResolvedValue(null),
    } as unknown as Mocked<JobService>;

    const mockTTSInferenceService = {
      generateSpeech: vi.fn().mockResolvedValue(Buffer.from('audio-data')),
      getStatus: vi
        .fn()
        .mockResolvedValue({ modelLoaded: true, status: 'online' }),
    } as unknown as Mocked<TTSInferenceService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TTSService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: LoggerService, useValue: mockLoggerService },
        { provide: JobService, useValue: mockJobService },
        { provide: TTSInferenceService, useValue: mockTTSInferenceService },
      ],
    }).compile();

    service = module.get<TTSService>(TTSService);
    configService = module.get(ConfigService);
    loggerService = module.get(LoggerService);
    jobService = module.get(JobService);
    ttsInferenceService = module.get(TTSInferenceService);

    vi.clearAllMocks();
  });

  describe('generate', () => {
    const mockRequest = {
      language: 'en',
      text: 'Hello world',
    };

    it('should create a job and return it immediately', async () => {
      jobService.createJob = vi.fn().mockResolvedValue(mockJob);
      mockedAxios.post = vi.fn().mockResolvedValue({
        data: { publicUrl: 'https://cdn.example.com/tts/output.wav' },
      });
      ttsInferenceService.getStatus = vi.fn().mockResolvedValue({
        modelLoaded: true,
        status: 'online',
      });
      ttsInferenceService.generateSpeech = vi
        .fn()
        .mockResolvedValue(Buffer.from('audio'));

      const result = await service.generate(mockRequest);

      expect(result).toEqual(mockJob);
      expect(jobService.createJob).toHaveBeenCalledWith({
        params: mockRequest,
        type: 'tts',
      });
    });

    it('should log generation request details', async () => {
      jobService.createJob = vi.fn().mockResolvedValue(mockJob);
      mockedAxios.post = vi.fn().mockResolvedValue({
        data: { publicUrl: 'https://cdn.example.com/out.wav' },
      });
      ttsInferenceService.getStatus = vi
        .fn()
        .mockResolvedValue({ modelLoaded: true, status: 'online' });
      ttsInferenceService.generateSpeech = vi
        .fn()
        .mockResolvedValue(Buffer.from('audio'));

      await service.generate(mockRequest);

      expect(loggerService.log).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ textLength: mockRequest.text.length }),
      );
    });

    it('should process job asynchronously without blocking', async () => {
      jobService.createJob = vi.fn().mockResolvedValue(mockJob);

      // Make inference slow but do not await it
      let inferenceResolved = false;
      ttsInferenceService.getStatus = vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => {
              inferenceResolved = true;
              resolve({ modelLoaded: true, status: 'online' as const });
            }, 50);
          }),
      );
      ttsInferenceService.generateSpeech = vi
        .fn()
        .mockResolvedValue(Buffer.from('audio'));
      mockedAxios.post = vi.fn().mockResolvedValue({
        data: { publicUrl: 'https://cdn.example.com/out.wav' },
      });

      const result = await service.generate(mockRequest);

      // generate() should have returned before inference resolved
      expect(inferenceResolved).toBe(false);
      expect(result.jobId).toBe(mockJob.jobId);
    });

    it('should update job to processing then completed on success', async () => {
      jobService.createJob = vi.fn().mockResolvedValue(mockJob);
      jobService.updateJob = vi.fn().mockResolvedValue(null);
      ttsInferenceService.getStatus = vi
        .fn()
        .mockResolvedValue({ modelLoaded: true, status: 'online' });
      ttsInferenceService.generateSpeech = vi
        .fn()
        .mockResolvedValue(Buffer.from('audio-data'));
      mockedAxios.post = vi.fn().mockResolvedValue({
        data: { publicUrl: 'https://cdn.example.com/out.wav' },
      });

      await service.generate(mockRequest);

      // Wait for the async fire-and-forget to settle
      await new Promise((r) => setTimeout(r, 20));

      expect(jobService.updateJob).toHaveBeenCalledWith(mockJob.jobId, {
        status: 'processing',
      });
      expect(jobService.updateJob).toHaveBeenCalledWith(
        mockJob.jobId,
        expect.objectContaining({
          audioUrl: expect.any(String),
          status: 'completed',
        }),
      );
    });

    it('should mark job as failed when inference is offline', async () => {
      jobService.createJob = vi.fn().mockResolvedValue(mockJob);
      jobService.updateJob = vi.fn().mockResolvedValue(null);
      ttsInferenceService.getStatus = vi
        .fn()
        .mockResolvedValue({ modelLoaded: false, status: 'offline' });

      await service.generate(mockRequest);
      await new Promise((r) => setTimeout(r, 20));

      expect(jobService.updateJob).toHaveBeenCalledWith(
        mockJob.jobId,
        expect.objectContaining({ status: 'failed' }),
      );
    });

    it('should mark job as failed when S3 upload returns no publicUrl', async () => {
      jobService.createJob = vi.fn().mockResolvedValue(mockJob);
      jobService.updateJob = vi.fn().mockResolvedValue(null);
      ttsInferenceService.getStatus = vi
        .fn()
        .mockResolvedValue({ modelLoaded: true, status: 'online' });
      ttsInferenceService.generateSpeech = vi
        .fn()
        .mockResolvedValue(Buffer.from('audio'));
      mockedAxios.post = vi.fn().mockResolvedValue({ data: {} });

      await service.generate(mockRequest);
      await new Promise((r) => setTimeout(r, 20));

      expect(jobService.updateJob).toHaveBeenCalledWith(
        mockJob.jobId,
        expect.objectContaining({
          error: expect.any(String),
          status: 'failed',
        }),
      );
    });

    it('should log warning when model is not loaded', async () => {
      jobService.createJob = vi.fn().mockResolvedValue(mockJob);
      jobService.updateJob = vi.fn().mockResolvedValue(null);
      ttsInferenceService.getStatus = vi
        .fn()
        .mockResolvedValue({ modelLoaded: false, status: 'online' });
      ttsInferenceService.generateSpeech = vi
        .fn()
        .mockResolvedValue(Buffer.from('audio'));
      mockedAxios.post = vi.fn().mockResolvedValue({
        data: { publicUrl: 'https://cdn.example.com/out.wav' },
      });

      await service.generate(mockRequest);
      await new Promise((r) => setTimeout(r, 20));

      expect(loggerService.warn).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ message: expect.stringContaining('slow') }),
      );
    });

    it('should upload audio to the files service URL', async () => {
      jobService.createJob = vi.fn().mockResolvedValue(mockJob);
      jobService.updateJob = vi.fn().mockResolvedValue(null);
      ttsInferenceService.getStatus = vi
        .fn()
        .mockResolvedValue({ modelLoaded: true, status: 'online' });
      ttsInferenceService.generateSpeech = vi
        .fn()
        .mockResolvedValue(Buffer.from('audio'));
      mockedAxios.post = vi.fn().mockResolvedValue({
        data: { publicUrl: 'https://cdn.example.com/out.wav' },
      });

      await service.generate(mockRequest);
      await new Promise((r) => setTimeout(r, 20));

      expect(mockedAxios.post).toHaveBeenCalledWith(
        'http://files.local:3000/v1/files/upload',
        expect.objectContaining({
          key: expect.stringContaining(mockJob.jobId),
        }),
        expect.any(Object),
      );
    });
  });
});
