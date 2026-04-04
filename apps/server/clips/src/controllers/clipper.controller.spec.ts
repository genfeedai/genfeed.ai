import { ConfigService } from '@clips/config/config.service';
import { ClipperController } from '@clips/controllers/clipper.controller';
import { ClipperQueueService } from '@clips/queues/clipper-queue.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Test, TestingModule } from '@nestjs/testing';
import { of, throwError } from 'rxjs';

vi.mock('@nestjs/axios');

describe('ClipperController', () => {
  let controller: ClipperController;
  let httpService: vi.Mocked<HttpService>;
  let clipperQueueService: vi.Mocked<ClipperQueueService>;
  let configService: vi.Mocked<ConfigService>;
  let loggerService: vi.Mocked<LoggerService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ClipperController],
      providers: [
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
            API_KEY: 'test-api-key',
            API_URL: 'http://api.test',
          },
        },
        {
          provide: ClipperQueueService,
          useValue: {
            addProcessJob: vi.fn(),
            addRetryJob: vi.fn(),
          },
        },
        {
          provide: LoggerService,
          useValue: {
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<ClipperController>(ClipperController);
    httpService = module.get(HttpService);
    clipperQueueService = module.get(ClipperQueueService);
    configService = module.get(ConfigService);
    loggerService = module.get(LoggerService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('createProject', () => {
    const createBody = {
      name: 'Test Project',
      organizationId: 'org-123',
      userId: 'user-123',
      videoUrl: 'https://example.com/video.mp4',
    };

    it('should create project and queue process job', async () => {
      const projectData = { _id: 'project-abc' };
      httpService.post.mockReturnValue(
        of({ data: projectData }) as ReturnType<typeof httpService.post>,
      );
      clipperQueueService.addProcessJob.mockResolvedValue('job-1');

      const result = await controller.createProject(createBody);

      expect(httpService.post).toHaveBeenCalledWith(
        'http://api.test/v1/clip-projects',
        expect.objectContaining({
          name: 'Test Project',
          organization: 'org-123',
          sourceVideoUrl: 'https://example.com/video.mp4',
          user: 'user-123',
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-api-key',
          }),
        }),
      );
      expect(clipperQueueService.addProcessJob).toHaveBeenCalledWith(
        'project-abc',
        'user-123',
        'org-123',
      );
      expect(result).toEqual({ data: projectData, success: true });
    });

    it('should use nested data._id when project returns data wrapper', async () => {
      const projectData = { data: { _id: 'nested-project-id' } };
      httpService.post.mockReturnValue(
        of({ data: projectData }) as ReturnType<typeof httpService.post>,
      );
      clipperQueueService.addProcessJob.mockResolvedValue('job-2');

      await controller.createProject(createBody);

      expect(clipperQueueService.addProcessJob).toHaveBeenCalledWith(
        'nested-project-id',
        'user-123',
        'org-123',
      );
    });

    it('should use empty string as name if none provided', async () => {
      const bodyWithoutName = { ...createBody, name: undefined };
      const projectData = { _id: 'project-abc' };
      httpService.post.mockReturnValue(
        of({ data: projectData }) as ReturnType<typeof httpService.post>,
      );
      clipperQueueService.addProcessJob.mockResolvedValue('job-1');

      await controller.createProject(bodyWithoutName as typeof createBody);

      expect(httpService.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ name: '' }),
        expect.any(Object),
      );
    });

    it('should throw error if http call fails', async () => {
      const error = new Error('Network error');
      httpService.post.mockReturnValue(
        throwError(() => error) as ReturnType<typeof httpService.post>,
      );

      await expect(controller.createProject(createBody)).rejects.toThrow(
        'Network error',
      );
      expect(loggerService.error).toHaveBeenCalled();
    });
  });

  describe('getProjectStatus', () => {
    it('should return project and clips data', async () => {
      const projectData = { _id: 'project-1', status: 'completed' };
      const clipsData = { data: [{ _id: 'clip-1' }] };

      httpService.get
        .mockReturnValueOnce(
          of({ data: projectData }) as ReturnType<typeof httpService.get>,
        )
        .mockReturnValueOnce(
          of({ data: clipsData }) as ReturnType<typeof httpService.get>,
        );

      const result = await controller.getProjectStatus('project-1');

      expect(result).toEqual({
        data: {
          clips: [{ _id: 'clip-1' }],
          project: projectData,
        },
        success: true,
      });
    });

    it('should handle nested data wrapper in response', async () => {
      const projectData = { data: { _id: 'project-1' } };
      const clipsData = { data: { data: [{ _id: 'clip-1' }] } };

      httpService.get
        .mockReturnValueOnce(
          of({ data: projectData }) as ReturnType<typeof httpService.get>,
        )
        .mockReturnValueOnce(
          of({ data: clipsData }) as ReturnType<typeof httpService.get>,
        );

      const result = await controller.getProjectStatus('project-1');

      expect(result.data.project).toEqual({ _id: 'project-1' });
      expect(result.data.clips).toEqual([{ _id: 'clip-1' }]);
    });

    it('should throw error and log if status fetch fails', async () => {
      const error = new Error('Status error');
      httpService.get.mockReturnValue(
        throwError(() => error) as ReturnType<typeof httpService.get>,
      );

      await expect(controller.getProjectStatus('project-1')).rejects.toThrow(
        'Status error',
      );
      expect(loggerService.error).toHaveBeenCalled();
    });
  });

  describe('retryProject', () => {
    it('should queue retry job and return success', async () => {
      clipperQueueService.addRetryJob.mockResolvedValue(undefined as never);

      const result = await controller.retryProject('project-1', {
        organizationId: 'org-123',
        userId: 'user-123',
      });

      expect(clipperQueueService.addRetryJob).toHaveBeenCalledWith(
        'project-1',
        'user-123',
        'org-123',
      );
      expect(result).toEqual({ message: 'Retry queued', success: true });
    });

    it('should throw and log error if retry fails', async () => {
      const error = new Error('Queue error');
      clipperQueueService.addRetryJob.mockRejectedValue(error);

      await expect(
        controller.retryProject('project-1', {
          organizationId: 'org-123',
          userId: 'user-123',
        }),
      ).rejects.toThrow('Queue error');
      expect(loggerService.error).toHaveBeenCalled();
    });
  });
});
