import { ConfigService } from '@api/config/config.service';
import {
  type TaskJobRequest,
  TaskQueueClientService,
} from '@api/services/task-queue-client/task-queue-client.service';
import { HttpService } from '@nestjs/axios';
import { Test, TestingModule } from '@nestjs/testing';
import { of, throwError } from 'rxjs';

describe('TaskQueueClientService', () => {
  let service: TaskQueueClientService;
  let httpService: vi.Mocked<HttpService>;

  const mockFilesServiceUrl = 'http://localhost:3012';

  const mockTaskJobRequest: TaskJobRequest = {
    assetId: '507f1f77bcf86cd799439014',
    config: {
      height: 1080,
      width: 1920,
    },
    metadata: {
      stepId: '507f1f77bcf86cd799439016',
      websocketUrl: 'ws://localhost:3011',
      workflowId: '507f1f77bcf86cd799439015',
    },
    organizationId: '507f1f77bcf86cd799439013',
    priority: 1,
    taskId: '507f1f77bcf86cd799439011',
    userId: '507f1f77bcf86cd799439012',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaskQueueClientService,
        {
          provide: HttpService,
          useValue: {
            get: vi.fn(),
            post: vi.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn().mockReturnValue(mockFilesServiceUrl),
          },
        },
      ],
    }).compile();

    service = module.get<TaskQueueClientService>(TaskQueueClientService);
    httpService = module.get(HttpService);

    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('queueTransformJob', () => {
    it('should queue a transform job successfully', async () => {
      const mockResponse = {
        data: {
          jobId: 'job-123',
          status: 'queued',
        },
      };

      httpService.post.mockReturnValue(of(mockResponse));

      const result = await service.queueTransformJob(mockTaskJobRequest);

      expect(result).toEqual(mockResponse.data);
      expect(httpService.post).toHaveBeenCalledWith(
        `${mockFilesServiceUrl}/tasks/queue/transform`,
        mockTaskJobRequest,
      );
    });

    it('should handle errors when queueing transform job', async () => {
      const error = new Error('Queue error');

      httpService.post.mockReturnValue(throwError(() => error));

      await expect(
        service.queueTransformJob(mockTaskJobRequest),
      ).rejects.toThrow(error);
    });
  });

  describe('queueUpscaleJob', () => {
    it('should queue an upscale job successfully', async () => {
      const mockResponse = {
        data: {
          jobId: 'job-456',
          status: 'queued',
        },
      };

      httpService.post.mockReturnValue(of(mockResponse));

      const result = await service.queueUpscaleJob(mockTaskJobRequest);

      expect(result).toEqual(mockResponse.data);
      expect(httpService.post).toHaveBeenCalledWith(
        `${mockFilesServiceUrl}/tasks/queue/upscale`,
        mockTaskJobRequest,
      );
    });

    it('should handle errors when queueing upscale job', async () => {
      const error = new Error('Upscale queue error');

      httpService.post.mockReturnValue(throwError(() => error));

      await expect(service.queueUpscaleJob(mockTaskJobRequest)).rejects.toThrow(
        error,
      );
    });
  });

  describe('queueCaptionJob', () => {
    it('should queue a caption job successfully', async () => {
      const mockResponse = {
        data: {
          jobId: 'job-789',
          status: 'queued',
        },
      };

      httpService.post.mockReturnValue(of(mockResponse));

      const result = await service.queueCaptionJob(mockTaskJobRequest);

      expect(result).toEqual(mockResponse.data);
      expect(httpService.post).toHaveBeenCalledWith(
        `${mockFilesServiceUrl}/tasks/queue/caption`,
        mockTaskJobRequest,
      );
    });

    it('should handle errors when queueing caption job', async () => {
      const error = new Error('Caption queue error');

      httpService.post.mockReturnValue(throwError(() => error));

      await expect(service.queueCaptionJob(mockTaskJobRequest)).rejects.toThrow(
        error,
      );
    });
  });

  describe('queueResizeJob', () => {
    it('should queue a resize job successfully', async () => {
      const mockResponse = {
        data: {
          jobId: 'job-101',
          status: 'queued',
        },
      };

      httpService.post.mockReturnValue(of(mockResponse));

      const result = await service.queueResizeJob(mockTaskJobRequest);

      expect(result).toEqual(mockResponse.data);
      expect(httpService.post).toHaveBeenCalledWith(
        `${mockFilesServiceUrl}/tasks/queue/resize`,
        mockTaskJobRequest,
      );
    });

    it('should handle errors when queueing resize job', async () => {
      const error = new Error('Resize queue error');

      httpService.post.mockReturnValue(throwError(() => error));

      await expect(service.queueResizeJob(mockTaskJobRequest)).rejects.toThrow(
        error,
      );
    });
  });

  describe('queueClipJob', () => {
    it('should queue a clip job successfully', async () => {
      const mockResponse = {
        data: {
          jobId: 'job-202',
          status: 'queued',
        },
      };

      httpService.post.mockReturnValue(of(mockResponse));

      const result = await service.queueClipJob(mockTaskJobRequest);

      expect(result).toEqual(mockResponse.data);
      expect(httpService.post).toHaveBeenCalledWith(
        `${mockFilesServiceUrl}/tasks/queue/clip`,
        mockTaskJobRequest,
      );
    });

    it('should handle errors when queueing clip job', async () => {
      const error = new Error('Clip queue error');

      httpService.post.mockReturnValue(throwError(() => error));

      await expect(service.queueClipJob(mockTaskJobRequest)).rejects.toThrow(
        error,
      );
    });
  });

  describe('getJobStatus', () => {
    it('should get job status successfully', async () => {
      const jobId = 'job-123';
      const mockResponse = {
        data: {
          jobId,
          progress: 100,
          result: {
            url: 'https://example.com/result.mp4',
          },
          status: 'completed',
        },
      };

      httpService.get.mockReturnValue(of(mockResponse));

      const result = await service.getJobStatus(jobId);

      expect(result).toEqual(mockResponse.data);
      expect(httpService.get).toHaveBeenCalledWith(
        `${mockFilesServiceUrl}/tasks/queue/status/${jobId}`,
      );
    });

    it('should handle errors when getting job status', async () => {
      const jobId = 'job-123';
      const error = new Error('Status fetch error');

      httpService.get.mockReturnValue(throwError(() => error));

      await expect(service.getJobStatus(jobId)).rejects.toThrow(error);
    });
  });

  describe('service configuration', () => {
    it('should use default files service URL when not configured', async () => {
      const moduleWithoutConfig = await Test.createTestingModule({
        providers: [
          TaskQueueClientService,
          {
            provide: HttpService,
            useValue: {
              post: vi.fn().mockReturnValue(
                of({
                  data: { jobId: 'test', status: 'queued' },
                }),
              ),
            },
          },
          {
            provide: ConfigService,
            useValue: {
              get: vi.fn().mockReturnValue(null),
            },
          },
        ],
      }).compile();

      const serviceWithoutConfig =
        moduleWithoutConfig.get<TaskQueueClientService>(TaskQueueClientService);

      expect(serviceWithoutConfig).toBeDefined();
    });
  });

  describe('job request variations', () => {
    it('should queue job with minimal request data', async () => {
      const minimalRequest: TaskJobRequest = {
        assetId: '507f1f77bcf86cd799439014',
        config: {},
        organizationId: '507f1f77bcf86cd799439013',
        taskId: '507f1f77bcf86cd799439011',
        userId: '507f1f77bcf86cd799439012',
      };

      const mockResponse = {
        data: { jobId: 'job-min', status: 'queued' },
      };

      httpService.post.mockReturnValue(of(mockResponse));

      const result = await service.queueTransformJob(minimalRequest);

      expect(result).toEqual(mockResponse.data);
      expect(httpService.post).toHaveBeenCalledWith(
        `${mockFilesServiceUrl}/tasks/queue/transform`,
        minimalRequest,
      );
    });

    it('should queue job with priority', async () => {
      const priorityRequest: TaskJobRequest = {
        ...mockTaskJobRequest,
        priority: 10,
      };

      const mockResponse = {
        data: { jobId: 'job-priority', status: 'queued' },
      };

      httpService.post.mockReturnValue(of(mockResponse));

      const result = await service.queueTransformJob(priorityRequest);

      expect(result).toEqual(mockResponse.data);
    });

    it('should queue job with metadata', async () => {
      const metadataRequest: TaskJobRequest = {
        ...mockTaskJobRequest,
        metadata: {
          stepId: 'step-456',
          websocketUrl: 'ws://custom:3003',
          workflowId: 'workflow-123',
        },
      };

      const mockResponse = {
        data: { jobId: 'job-metadata', status: 'queued' },
      };

      httpService.post.mockReturnValue(of(mockResponse));

      const result = await service.queueTransformJob(metadataRequest);

      expect(result).toEqual(mockResponse.data);
    });
  });
});
