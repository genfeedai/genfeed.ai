import { ConfigService } from '@clips/config/config.service';
import { ClipExtractorService } from '@clips/services/clip-extractor.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Test, TestingModule } from '@nestjs/testing';
import { of, throwError } from 'rxjs';

vi.mock('@nestjs/axios');

describe('ClipExtractorService', () => {
  let service: ClipExtractorService;
  let httpService: vi.Mocked<HttpService>;
  let configService: vi.Mocked<ConfigService>;
  let loggerService: vi.Mocked<LoggerService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClipExtractorService,
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
            FILES_URL: 'http://files.test',
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

    service = module.get<ClipExtractorService>(ClipExtractorService);
    httpService = module.get(HttpService);
    configService = module.get(ConfigService);
    loggerService = module.get(LoggerService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('extractClip', () => {
    const mockJobId = 'job-123';
    const mockResult = {
      outputUrl: 'https://cdn.test/clip.mp4',
      s3Key: 'clips/clip.mp4',
    };

    function setupSuccessfulExtraction() {
      // Post returns job ID
      httpService.post.mockReturnValue(
        of({ data: { jobId: mockJobId } }) as ReturnType<
          typeof httpService.post
        >,
      );
      // Poll returns completed
      httpService.get.mockReturnValue(
        of({ data: { result: mockResult, status: 'completed' } }) as ReturnType<
          typeof httpService.get
        >,
      );
    }

    it('should extract clip and return result', async () => {
      setupSuccessfulExtraction();

      const result = await service.extractClip(
        'https://video.test/source.mp4',
        10,
        40,
        'user-1',
        'org-1',
      );

      expect(result.videoUrl).toBe('https://cdn.test/clip.mp4');
      expect(result.videoS3Key).toBe('clips/clip.mp4');
      expect(result.jobId).toBe(mockJobId);
    });

    it('should post to files service with correct params', async () => {
      setupSuccessfulExtraction();

      await service.extractClip(
        'https://video.test/source.mp4',
        10,
        40,
        'user-1',
        'org-1',
      );

      expect(httpService.post).toHaveBeenCalledWith(
        'http://files.test/v1/files/process/video',
        expect.objectContaining({
          organizationId: 'org-1',
          params: expect.objectContaining({
            duration: 30,
            endTime: 40,
            inputPath: 'https://video.test/source.mp4',
            startTime: 10,
          }),
          type: 'clip-media',
          userId: 'user-1',
        }),
        expect.any(Object),
      );
    });

    it('should use nested jobId from response', async () => {
      httpService.post.mockReturnValue(
        of({ data: { data: { jobId: 'nested-job-id' } } }) as ReturnType<
          typeof httpService.post
        >,
      );
      httpService.get.mockReturnValue(
        of({ data: { result: mockResult, status: 'completed' } }) as ReturnType<
          typeof httpService.get
        >,
      );

      const result = await service.extractClip(
        'https://video.test/source.mp4',
        0,
        30,
        'user-1',
        'org-1',
      );

      expect(result.jobId).toBe('nested-job-id');
    });

    it('should throw when job fails', async () => {
      httpService.post.mockReturnValue(
        of({ data: { jobId: mockJobId } }) as ReturnType<
          typeof httpService.post
        >,
      );
      httpService.get.mockReturnValue(
        of({
          data: { error: 'Processing error', status: 'failed' },
        }) as ReturnType<typeof httpService.get>,
      );

      await expect(
        service.extractClip(
          'https://video.test/source.mp4',
          0,
          30,
          'user-1',
          'org-1',
        ),
      ).rejects.toThrow(`Job ${mockJobId} failed: Processing error`);
    });

    it('should throw if HTTP post fails', async () => {
      const error = new Error('Network failure');
      httpService.post.mockReturnValue(
        throwError(() => error) as ReturnType<typeof httpService.post>,
      );

      await expect(
        service.extractClip(
          'https://video.test/source.mp4',
          0,
          30,
          'user-1',
          'org-1',
        ),
      ).rejects.toThrow('Network failure');
      expect(loggerService.error).toHaveBeenCalled();
    });
  });

  describe('addCaptions', () => {
    const mockJobId = 'caption-job-1';
    const mockResult = {
      captionedVideoUrl: 'https://cdn.test/captioned.mp4',
      outputS3Key: 'clips/captioned.mp4',
      outputUrl: 'https://cdn.test/captioned.mp4',
    };

    function setupSuccessfulCaptions() {
      httpService.post.mockReturnValue(
        of({ data: { jobId: mockJobId } }) as ReturnType<
          typeof httpService.post
        >,
      );
      httpService.get.mockReturnValue(
        of({ data: { result: mockResult, status: 'completed' } }) as ReturnType<
          typeof httpService.get
        >,
      );
    }

    it('should add captions and return result', async () => {
      setupSuccessfulCaptions();

      const result = await service.addCaptions(
        'https://cdn.test/clip.mp4',
        '1\n00:00:00,000 --> 00:00:01,000\nHello',
        'user-1',
        'org-1',
      );

      expect(result.captionedVideoUrl).toBe('https://cdn.test/captioned.mp4');
      expect(result.jobId).toBe(mockJobId);
    });

    it('should post with correct type and srtContent', async () => {
      setupSuccessfulCaptions();
      const srtContent = '1\n00:00:00,000 --> 00:00:01,000\nHello';

      await service.addCaptions(
        'https://cdn.test/clip.mp4',
        srtContent,
        'user-1',
        'org-1',
      );

      expect(httpService.post).toHaveBeenCalledWith(
        'http://files.test/v1/files/process/video',
        expect.objectContaining({
          params: expect.objectContaining({
            inputPath: 'https://cdn.test/clip.mp4',
            srtContent,
          }),
          type: 'add-captions-overlay',
        }),
        expect.any(Object),
      );
    });

    it('should throw if caption job fails', async () => {
      httpService.post.mockReturnValue(
        of({ data: { jobId: mockJobId } }) as ReturnType<
          typeof httpService.post
        >,
      );
      httpService.get.mockReturnValue(
        of({
          data: { error: 'Caption error', status: 'failed' },
        }) as ReturnType<typeof httpService.get>,
      );

      await expect(
        service.addCaptions(
          'https://cdn.test/clip.mp4',
          'srt',
          'user-1',
          'org-1',
        ),
      ).rejects.toThrow(`Job ${mockJobId} failed: Caption error`);
    });
  });
});
