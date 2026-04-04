import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { ConfigService } from '@api/config/config.service';
import {
  FileProcessingJob,
  FileQueueService,
  JobResponse,
} from '@api/services/files-microservice/queue/file-queue.service';
import type { IFrameInput, IJobStatusResponse } from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Test, TestingModule } from '@nestjs/testing';
import type { AxiosResponse } from 'axios';
import { of, throwError } from 'rxjs';

const httpResponse = <T>(data: T) => of({ data } as AxiosResponse<T>);

describe('FileQueueService', () => {
  let service: FileQueueService;
  let httpService: HttpService;
  let loggerService: LoggerService;

  const mockJob: FileProcessingJob = {
    ingredientId: '507f1f77bcf86cd799439011',
    organizationId: '507f1f77bcf86cd799439013',
    params: { quality: 'high' },
    priority: 1,
    type: 'video-processing',
    userId: '507f1f77bcf86cd799439012',
  };

  const mockJobResponse: JobResponse = {
    ingredientId: '507f1f77bcf86cd799439011',
    jobId: 'job_123',
    status: 'queued',
    type: 'video-processing',
  };

  beforeEach(async () => {
    const mockHttpService = {
      get: vi.fn(),
      post: vi.fn(),
    };

    const mockConfigService = {
      get: vi.fn().mockReturnValue('http://files.genfeed.ai:3000'),
    };

    const mockLoggerService = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    const mockCredentialsService = {
      findOne: vi.fn(),
      patch: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FileQueueService,
        {
          provide: HttpService,
          useValue: mockHttpService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: LoggerService,
          useValue: mockLoggerService,
        },
        {
          provide: CredentialsService,
          useValue: mockCredentialsService,
        },
      ],
    }).compile();

    service = module.get<FileQueueService>(FileQueueService);
    httpService = module.get<HttpService>(HttpService);
    module.get<ConfigService>(ConfigService);
    loggerService = module.get<LoggerService>(LoggerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('processVideo', () => {
    it('should process video job successfully', async () => {
      const mockResponse = { data: mockJobResponse };
      vi.spyOn(httpService, 'post').mockReturnValue(
        httpResponse(mockResponse.data),
      );

      const result = await service.processVideo(mockJob);

      expect(result).toEqual(mockJobResponse);
      expect(httpService.post).toHaveBeenCalledWith(
        'http://files.genfeed.ai:3000/v1/files/process/video',
        mockJob,
      );
    });

    it('should handle video processing error', async () => {
      const error = new Error('Network error');
      vi.spyOn(httpService, 'post').mockReturnValue(throwError(() => error));

      await expect(service.processVideo(mockJob)).rejects.toThrow(
        'Network error',
      );
      expect(loggerService.error).toHaveBeenCalledWith(
        'Failed to queue video processing job',
        error,
      );
    });
  });

  describe('processImage', () => {
    it('should process image job successfully', async () => {
      const mockResponse = { data: mockJobResponse };
      vi.spyOn(httpService, 'post').mockReturnValue(
        httpResponse(mockResponse.data),
      );

      const result = await service.processImage(mockJob);

      expect(result).toEqual(mockJobResponse);
      expect(httpService.post).toHaveBeenCalledWith(
        'http://files.genfeed.ai:3000/v1/files/process/image',
        mockJob,
      );
    });

    it('should handle image processing error', async () => {
      const error = new Error('Network error');
      vi.spyOn(httpService, 'post').mockReturnValue(throwError(() => error));

      await expect(service.processImage(mockJob)).rejects.toThrow(
        'Network error',
      );
      expect(loggerService.error).toHaveBeenCalledWith(
        'Failed to queue image processing job',
        error,
      );
    });
  });

  describe('processFile', () => {
    it('should process file job successfully', async () => {
      const mockResponse = { data: mockJobResponse };
      vi.spyOn(httpService, 'post').mockReturnValue(
        httpResponse(mockResponse.data),
      );

      const result = await service.processFile(mockJob);

      expect(result).toEqual(mockJobResponse);
      expect(httpService.post).toHaveBeenCalledWith(
        'http://files.genfeed.ai:3000/v1/files/process/file',
        mockJob,
      );
    });

    it('should handle file processing error', async () => {
      const error = new Error('Network error');
      vi.spyOn(httpService, 'post').mockReturnValue(throwError(() => error));

      await expect(service.processFile(mockJob)).rejects.toThrow(
        'Network error',
      );
      expect(loggerService.error).toHaveBeenCalledWith(
        'Failed to queue file processing job',
        error,
      );
    });
  });

  describe('getJobStatus', () => {
    it('should get job status successfully', async () => {
      const jobId = 'job_123';
      const mockStatus = { progress: 50, state: 'processing' };
      const mockResponse = { data: mockStatus };
      vi.spyOn(httpService, 'get').mockReturnValue(
        httpResponse(mockResponse.data),
      );

      const result = await service.getJobStatus(jobId);

      expect(result).toEqual(mockStatus);
      expect(httpService.get).toHaveBeenCalledWith(
        'http://files.genfeed.ai:3000/v1/files/job/job_123',
      );
    });

    it('should handle get job status error', async () => {
      const jobId = 'job_123';
      const error = new Error('Job not found');
      vi.spyOn(httpService, 'get').mockReturnValue(throwError(() => error));

      await expect(service.getJobStatus(jobId)).rejects.toThrow(
        'Job not found',
      );
      expect(loggerService.error).toHaveBeenCalledWith(
        'Failed to get job status for job_123',
        error,
      );
    });
  });

  describe('waitForJob', () => {
    it('should wait for job completion', async () => {
      const jobId = 'job_123';
      const mockResult = { url: 'https://example.com/result.mp4' };
      const mockStatus = { result: mockResult, state: 'completed' };
      vi.spyOn(httpService, 'get').mockReturnValue(httpResponse(mockStatus));
      vi.spyOn(service, 'getJobStatus').mockResolvedValue(
        mockStatus as unknown as IJobStatusResponse,
      );

      const result = await service.waitForJob(jobId);

      expect(result).toEqual(mockResult);
    });

    it('should handle job failure', async () => {
      const jobId = 'job_123';
      const mockStatus = { failedReason: 'Processing error', state: 'failed' };

      vi.spyOn(service, 'getJobStatus').mockResolvedValue(
        mockStatus as unknown as IJobStatusResponse,
      );

      await expect(service.waitForJob(jobId)).rejects.toThrow(
        'Processing error',
      );
    });

    it('should handle job timeout', async () => {
      const jobId = 'job_123';
      const mockStatus = { state: 'processing' };

      vi.spyOn(service, 'getJobStatus').mockResolvedValue(
        mockStatus as unknown as IJobStatusResponse,
      );
      vi.spyOn(global, 'setTimeout').mockImplementation((callback) => {
        callback();
        return {} as ReturnType<typeof setTimeout>;
      });

      await expect(service.waitForJob(jobId, 100)).rejects.toThrow(
        'Job timeout',
      );
    });
  });

  describe('getQueueStats', () => {
    it('should get queue statistics successfully', async () => {
      const mockStats = { completed: 100, pending: 5, processing: 2 };
      const mockResponse = { data: mockStats };
      vi.spyOn(httpService, 'get').mockReturnValue(httpResponse(mockStats));

      const result = await service.getQueueStats();

      expect(result).toEqual(mockStats);
      expect(httpService.get).toHaveBeenCalledWith(
        'http://files.genfeed.ai:3000/v1/files/stats',
      );
    });

    it('should handle get queue stats error', async () => {
      const error = new Error('Service unavailable');
      vi.spyOn(httpService, 'get').mockReturnValue(throwError(() => error));

      await expect(service.getQueueStats()).rejects.toThrow(
        'Service unavailable',
      );
      expect(loggerService.error).toHaveBeenCalledWith(
        'Failed to get queue statistics',
        error,
      );
    });
  });

  describe('addWatermark', () => {
    it('should add watermark to file', async () => {
      const ingredientId = '507f1f77bcf86cd799439011';
      const filePath = '/path/to/file.mp4';
      const text = 'Genfeed';
      const mockResponse = { data: mockJobResponse };

      vi.spyOn(httpService, 'post').mockReturnValue(
        httpResponse(mockResponse.data),
      );

      const result = await service.addWatermark(ingredientId, filePath, text);

      expect(result).toEqual(mockJobResponse);
      expect(httpService.post).toHaveBeenCalledWith(
        'http://files.genfeed.ai:3000/v1/files/process/file',
        expect.objectContaining({
          filePath,
          ingredientId,
          organizationId: 'system',
          params: {
            filePath,
            watermarkText: text,
          },
          type: 'add-watermark',
          userId: 'system',
        }),
      );
    });
  });

  describe('createGif', () => {
    it('should create GIF from video', async () => {
      const ingredientId = '507f1f77bcf86cd799439011';
      const videoPath = '/path/to/video.mp4';
      const options = { duration: 5, fps: 10 };
      const mockResponse = { data: mockJobResponse };

      vi.spyOn(httpService, 'post').mockReturnValue(
        httpResponse(mockResponse.data),
      );

      const result = await service.createGif(ingredientId, videoPath, options);

      expect(result).toEqual(mockJobResponse);
      expect(httpService.post).toHaveBeenCalledWith(
        'http://files.genfeed.ai:3000/v1/files/process/video',
        expect.objectContaining({
          ingredientId,
          organizationId: 'system',
          params: {
            duration: 5,
            fps: 10,
            inputPath: videoPath,
          },
          type: 'video-to-gif',
          userId: 'system',
        }),
      );
    });
  });

  describe('convertToPortrait', () => {
    it('should convert video to portrait format', async () => {
      const ingredientId = '507f1f77bcf86cd799439011';
      const videoPath = '/path/to/video.mp4';
      const dimensions = { height: 1920, width: 1080 };
      const mockResponse = { data: mockJobResponse };

      vi.spyOn(httpService, 'post').mockReturnValue(
        httpResponse(mockResponse.data),
      );

      const result = await service.convertToPortrait(
        ingredientId,
        videoPath,
        dimensions,
      );

      expect(result).toEqual(mockJobResponse);
      expect(httpService.post).toHaveBeenCalledWith(
        'http://files.genfeed.ai:3000/v1/files/process/video',
        expect.objectContaining({
          ingredientId,
          organizationId: 'system',
          params: {
            height: 1920,
            inputPath: videoPath,
            width: 1080,
          },
          type: 'convert-to-portrait',
          userId: 'system',
        }),
      );
    });

    it('should use default dimensions when not provided', async () => {
      const ingredientId = '507f1f77bcf86cd799439011';
      const videoPath = '/path/to/video.mp4';
      const mockResponse = { data: mockJobResponse };

      vi.spyOn(httpService, 'post').mockReturnValue(
        httpResponse(mockResponse.data),
      );

      await service.convertToPortrait(ingredientId, videoPath);

      expect(httpService.post).toHaveBeenCalledWith(
        'http://files.genfeed.ai:3000/v1/files/process/video',
        expect.objectContaining({
          params: {
            height: 1920,
            inputPath: videoPath,
            width: 1080,
          },
        }),
      );
    });
  });

  describe('prepareAllFiles', () => {
    it('should prepare all files for processing', async () => {
      const ingredientId = '507f1f77bcf86cd799439011';
      const frames = [{ id: 1 }, { id: 2 }] as unknown as IFrameInput[];
      const musicId = 'music_123';
      const mockResponse = { data: mockJobResponse };

      vi.spyOn(httpService, 'post').mockReturnValue(
        httpResponse(mockResponse.data),
      );

      const result = await service.prepareAllFiles(
        ingredientId,
        frames,
        musicId,
      );

      expect(result).toEqual(mockJobResponse);
      expect(httpService.post).toHaveBeenCalledWith(
        'http://files.genfeed.ai:3000/v1/files/process/file',
        expect.objectContaining({
          ingredientId,
          organizationId: 'system',
          params: {
            frames,
            musicId,
          },
          type: 'prepare-all-files',
          userId: 'system',
        }),
      );
    });
  });

  describe('cleanupTempFiles', () => {
    it('should cleanup temporary files', async () => {
      const ingredientId = '507f1f77bcf86cd799439011';
      const delay = 5000;
      const mockResponse = { data: mockJobResponse };

      vi.spyOn(httpService, 'post').mockReturnValue(
        httpResponse(mockResponse.data),
      );

      const result = await service.cleanupTempFiles(ingredientId, delay);

      expect(result).toEqual(mockJobResponse);
      expect(httpService.post).toHaveBeenCalledWith(
        'http://files.genfeed.ai:3000/v1/files/process/file',
        expect.objectContaining({
          delay: 5000,
          ingredientId,
          organizationId: 'system',
          params: {
            isDeleteOutputEnabled: true,
          },
          type: 'cleanup-temp-files',
          userId: 'system',
        }),
      );
    });
  });
});
