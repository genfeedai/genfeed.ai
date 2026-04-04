import { VideoProcessor } from '@files/processors/video.processor';
import { JOB_TYPES, type JobType } from '@files/queues/queue.constants';
import type { VideoJobData } from '@files/shared/interfaces/job.interface';
import { VideoTransition } from '@genfeedai/enums';
import { RedisService } from '@libs/redis/redis.service';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Job } from 'bullmq';
import type { Mock } from 'vitest';

// Mock fs module
vi.mock('fs', () => ({
  existsSync: vi.fn().mockReturnValue(true),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

// Mock services
class MockFFmpegService {
  constructorName = 'MockFFmpegService';
  loggerService = {} as unknown;
  binaryValidationService = {} as unknown;
  resizeVideo = vi.fn().mockResolvedValue(undefined);
  getTempPath = vi.fn((type: string, id: string) => `/tmp/${type}-${id}`);
  cleanupTempFiles = vi.fn();
  executeFFmpeg = vi.fn();
  validateBinary = vi.fn();
  getFFmpegVersion = vi.fn();
  checkFFmpegAvailability = vi.fn();
  processVideo = vi.fn();
  extractThumbnail = vi.fn();
  getVideoInfo = vi.fn();
  convertFormat = vi.fn();
  mergeVideos = vi.fn().mockResolvedValue(undefined);
  mergeVideosWithMusic = vi.fn().mockResolvedValue(undefined);
  mergeVideosWithTransitions = vi.fn().mockResolvedValue(undefined);
  addWatermark = vi.fn();
  trimVideo = vi.fn().mockResolvedValue(undefined);
  compressVideo = vi.fn();
  adjustVolume = vi.fn();
  addSubtitle = vi.fn();
  generatePreview = vi.fn();
  extractAudio = vi.fn();
  replaceAudio = vi.fn();
  rotateVideo = vi.fn();
  cropVideo = vi.fn();
  speedUpVideo = vi.fn();
  slowDownVideo = vi.fn();
  reverseVideo = vi.fn().mockResolvedValue(undefined);
  fadeInOut = vi.fn();
  addTextOverlay = vi.fn().mockResolvedValue(undefined);
  blurVideo = vi.fn();
  sharpenVideo = vi.fn();
  adjustBrightness = vi.fn();
  adjustContrast = vi.fn();
  mirrorVideo = vi.fn().mockResolvedValue(undefined);
  convertToPortrait = vi.fn().mockResolvedValue(undefined);
  convertToGif = vi.fn().mockResolvedValue(undefined);
  addCaptions = vi.fn().mockResolvedValue(undefined);
  convertVideoToAudio = vi.fn().mockResolvedValue(undefined);
  extractFrame = vi.fn().mockResolvedValue(undefined);
  getVideoMetadata = vi.fn().mockResolvedValue({
    codec: 'h264',
    duration: 10,
    fps: 30,
    height: 1080,
    width: 1920,
  });
}

class MockS3Service {
  uploadFile = vi.fn().mockResolvedValue(undefined);
  downloadFile = vi.fn().mockResolvedValue(undefined);
  downloadFromUrl = vi.fn().mockResolvedValue(undefined);
  generateS3Key = vi.fn((type: string, id: string) => `${type}/${id}.mp4`);
  getPublicUrl = vi.fn((key: string) => `https://s3.amazonaws.com/${key}`);
}

class MockWebSocketService {
  emitProgress = vi.fn();
  emitSuccess = vi.fn();
  emitError = vi.fn();
}

class MockLoggerService {
  log = vi.fn();
  error = vi.fn();
  warn = vi.fn();
  debug = vi.fn();
}

// Helper to create job data
const createMockJobData = (
  overrides: Partial<VideoJobData> = {},
): VideoJobData => ({
  clerkUserId: 'clerk-user-123',
  createdAt: new Date(),
  id: 'job-data-123',
  ingredientId: 'test-ingredient-123',
  metadata: {
    websocketUrl: 'ws://localhost',
    ...overrides.metadata,
  },
  organizationId: 'org-123',
  params: {
    height: 1080,
    s3Key: 'input/video.mp4',
    width: 1920,
    ...overrides.params,
  },
  room: 'test-room',
  type: JOB_TYPES.RESIZE_VIDEO as JobType,
  userId: 'user-123',
  ...overrides,
});

// Helper to create mock job
const createMockJob = <T = VideoJobData>(
  name: string,
  data: T,
  id = 'job-123',
): Job<T> =>
  ({
    data,
    id,
    name,
  }) as unknown as Job<T>;

describe('VideoProcessor', () => {
  let processor: VideoProcessor;
  let ffmpegService: MockFFmpegService;
  let s3Service: MockS3Service;
  let webSocketService: MockWebSocketService;
  let loggerService: MockLoggerService;
  let redisService: RedisService;

  beforeEach(async () => {
    ffmpegService = new MockFFmpegService();
    s3Service = new MockS3Service();
    webSocketService = new MockWebSocketService();
    loggerService = new MockLoggerService();

    const mockRedisService = {
      publish: vi.fn().mockResolvedValue(1),
      subscribe: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: 'FFmpegService',
          useValue: ffmpegService,
        },
        {
          provide: 'S3Service',
          useValue: s3Service,
        },
        {
          provide: 'WebSocketService',
          useValue: webSocketService,
        },
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
      ],
    }).compile();

    redisService = module.get(RedisService);

    // VideoProcessor constructor order: FFmpegService, S3Service, WebSocketService, RedisService, LoggerService
    processor = new VideoProcessor(
      ffmpegService as unknown as never,
      s3Service as unknown as never,
      webSocketService as unknown as never,
      redisService,
      loggerService as unknown as never,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // Initialization
  // ==========================================================================
  describe('initialization', () => {
    it('should be defined', () => {
      expect(processor).toBeDefined();
    });

    it('should have all required dependencies', () => {
      expect(ffmpegService).toBeDefined();
      expect(s3Service).toBeDefined();
      expect(webSocketService).toBeDefined();
      expect(loggerService).toBeDefined();
      expect(redisService).toBeDefined();
    });
  });

  // ==========================================================================
  // process() - Job Router
  // ==========================================================================
  describe('process', () => {
    it('should route MERGE_VIDEOS job correctly', async () => {
      const data = createMockJobData({
        params: { sourceIds: ['id1', 'id2'] },
      });
      const job = createMockJob(JOB_TYPES.MERGE_VIDEOS, data);

      await processor.process(job);

      expect(loggerService.log).toHaveBeenCalledWith(
        expect.stringContaining('Processing video job'),
      );
    });

    it('should route RESIZE_VIDEO job correctly', async () => {
      const job = createMockJob(JOB_TYPES.RESIZE_VIDEO, createMockJobData());

      await processor.process(job);

      expect(ffmpegService.resizeVideo).toHaveBeenCalled();
    });

    it('should route ADD_CAPTIONS job correctly', async () => {
      const data = createMockJobData({
        params: { captionContent: 'Test captions' },
      });
      const job = createMockJob(JOB_TYPES.ADD_CAPTIONS, data);

      await processor.process(job);

      expect(ffmpegService.addCaptions).toHaveBeenCalled();
    });

    it('should route VIDEO_TO_GIF job correctly', async () => {
      const job = createMockJob(JOB_TYPES.VIDEO_TO_GIF, createMockJobData());

      await processor.process(job);

      expect(ffmpegService.convertToGif).toHaveBeenCalled();
    });

    it('should route REVERSE_VIDEO job correctly', async () => {
      const job = createMockJob(JOB_TYPES.REVERSE_VIDEO, createMockJobData());

      await processor.process(job);

      expect(ffmpegService.reverseVideo).toHaveBeenCalled();
    });

    it('should route MIRROR_VIDEO job correctly', async () => {
      const job = createMockJob(JOB_TYPES.MIRROR_VIDEO, createMockJobData());

      await processor.process(job);

      expect(ffmpegService.mirrorVideo).toHaveBeenCalled();
    });

    it('should route TRIM_VIDEO job correctly', async () => {
      const data = createMockJobData({
        params: { endTime: 10, startTime: 0 },
      });
      const job = createMockJob(JOB_TYPES.TRIM_VIDEO, data);

      await processor.process(job);

      expect(ffmpegService.trimVideo).toHaveBeenCalled();
    });

    it('should route ADD_TEXT_OVERLAY job correctly', async () => {
      const data = createMockJobData({ params: { text: 'Hello' } });
      const job = createMockJob(JOB_TYPES.ADD_TEXT_OVERLAY, data);

      await processor.process(job);

      expect(ffmpegService.addTextOverlay).toHaveBeenCalled();
    });

    it('should route CONVERT_TO_PORTRAIT job correctly', async () => {
      const job = createMockJob(
        JOB_TYPES.CONVERT_TO_PORTRAIT,
        createMockJobData(),
      );

      await processor.process(job);

      expect(ffmpegService.convertToPortrait).toHaveBeenCalled();
    });

    it('should route VIDEO_TO_AUDIO job correctly', async () => {
      const job = createMockJob(JOB_TYPES.VIDEO_TO_AUDIO, createMockJobData());

      await processor.process(job);

      expect(ffmpegService.convertVideoToAudio).toHaveBeenCalled();
    });

    it('should route EXTRACT_FRAMES job correctly', async () => {
      const data = createMockJobData({
        params: { inputPath: '/tmp/input.mp4' },
      });
      const job = createMockJob(JOB_TYPES.EXTRACT_FRAMES, data);

      await processor.process(job);

      expect(ffmpegService.extractFrame).toHaveBeenCalled();
    });

    it('should route GET_VIDEO_METADATA job correctly', async () => {
      const data = createMockJobData({
        params: { videoPath: '/tmp/input.mp4' },
      });
      const job = createMockJob(JOB_TYPES.GET_VIDEO_METADATA, data);

      await processor.process(job);

      expect(ffmpegService.getVideoMetadata).toHaveBeenCalled();
    });

    it('should throw error for unknown job type', async () => {
      const job = createMockJob('UNKNOWN_JOB_TYPE', createMockJobData());

      await expect(processor.process(job)).rejects.toThrow(
        'Unknown video job type: UNKNOWN_JOB_TYPE',
      );
    });
  });

  // ==========================================================================
  // handleResize
  // ==========================================================================
  describe('handleResize', () => {
    const mockJobData = createMockJobData();
    const mockJob = createMockJob(JOB_TYPES.RESIZE_VIDEO, mockJobData);

    it('should handle resize job successfully', async () => {
      const result = await processor.handleResize(mockJob);

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(s3Service.downloadFile).toHaveBeenCalled();
      expect(ffmpegService.resizeVideo).toHaveBeenCalled();
      expect(s3Service.uploadFile).toHaveBeenCalled();
      expect(webSocketService.emitSuccess).toHaveBeenCalled();
      expect(redisService.publish).toHaveBeenCalledWith(
        'video-processing-complete',
        expect.objectContaining({
          ingredientId: mockJobData.ingredientId,
          status: 'completed',
        }),
      );
    });

    it('should download from URL when inputPath provided', async () => {
      const data = createMockJobData({
        params: {
          inputPath: 'https://example.com/video.mp4',
          s3Key: undefined,
        },
      });
      const job = createMockJob(JOB_TYPES.RESIZE_VIDEO, data);

      await processor.handleResize(job);

      expect(s3Service.downloadFromUrl).toHaveBeenCalled();
    });

    it('should handle errors during resize', async () => {
      const error = new Error('Resize failed');
      s3Service.downloadFile.mockRejectedValue(error);

      await expect(processor.handleResize(mockJob)).rejects.toThrow(
        'Resize failed',
      );

      expect(webSocketService.emitError).toHaveBeenCalled();
      expect(redisService.publish).toHaveBeenCalledWith(
        'video-processing-complete',
        expect.objectContaining({
          status: 'failed',
        }),
      );
    });

    it('should emit progress updates during processing', async () => {
      ffmpegService.resizeVideo.mockImplementation(
        (_input, _output, _width, _height, onProgress) => {
          if (onProgress) {
            onProgress({ percent: 50 });
          }
          return Promise.resolve();
        },
      );

      await processor.handleResize(mockJob);

      expect(webSocketService.emitProgress).toHaveBeenCalled();
    });

    it('should cleanup temp files after processing', async () => {
      await processor.handleResize(mockJob);

      expect(ffmpegService.cleanupTempFiles).toHaveBeenCalledWith(
        mockJobData.ingredientId,
        'resize',
      );
    });

    it('should use default dimensions when not provided', async () => {
      const data = createMockJobData({
        params: { height: undefined, s3Key: 'test.mp4', width: undefined },
      });
      const job = createMockJob(JOB_TYPES.RESIZE_VIDEO, data);

      await processor.handleResize(job);

      expect(ffmpegService.resizeVideo).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        1080,
        1920,
        expect.any(Function),
      );
    });
  });

  // ==========================================================================
  // handleMerge
  // ==========================================================================
  describe('handleMerge', () => {
    const mockJobData = createMockJobData({
      params: {
        sourceIds: ['source1', 'source2', 'source3'],
      },
    });
    const mockJob = createMockJob(JOB_TYPES.MERGE_VIDEOS, mockJobData);

    it('should merge videos successfully', async () => {
      const result = await processor.handleMerge(mockJob);

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(s3Service.downloadFile).toHaveBeenCalledTimes(3);
      expect(ffmpegService.mergeVideos).toHaveBeenCalled();
      expect(s3Service.uploadFile).toHaveBeenCalled();
      expect(webSocketService.emitSuccess).toHaveBeenCalled();
    });

    it('should merge videos with music when music param provided', async () => {
      const data = createMockJobData({
        params: {
          isMuteVideoAudio: true,
          music: 'music-id',
          musicVolume: 0.1,
          sourceIds: ['source1', 'source2'],
        },
      });
      const job = createMockJob(JOB_TYPES.MERGE_VIDEOS, data);

      await processor.handleMerge(job);

      expect(s3Service.downloadFile).toHaveBeenCalledTimes(3); // 2 videos + 1 music
      expect(ffmpegService.mergeVideosWithMusic).toHaveBeenCalled();
    });

    it('should merge videos with transitions when transition param provided', async () => {
      const data = createMockJobData({
        params: {
          sourceIds: ['source1', 'source2'],
          transition: VideoTransition.FADE,
          transitionDuration: 0.5,
        },
      });
      const job = createMockJob(JOB_TYPES.MERGE_VIDEOS, data);

      await processor.handleMerge(job);

      expect(ffmpegService.mergeVideosWithTransitions).toHaveBeenCalled();
    });

    it('should not use transition when set to none', async () => {
      const data = createMockJobData({
        params: {
          sourceIds: ['source1', 'source2'],
          transition: VideoTransition.NONE,
        },
      });
      const job = createMockJob(JOB_TYPES.MERGE_VIDEOS, data);

      await processor.handleMerge(job);

      expect(ffmpegService.mergeVideos).toHaveBeenCalled();
      expect(ffmpegService.mergeVideosWithTransitions).not.toHaveBeenCalled();
    });

    it('should resize after merge when isResizeEnabled is true', async () => {
      const data = createMockJobData({
        params: {
          height: 1920,
          isResizeEnabled: true,
          sourceIds: ['source1', 'source2'],
          width: 1080,
        },
      });
      const job = createMockJob(JOB_TYPES.MERGE_VIDEOS, data);

      await processor.handleMerge(job);

      expect(ffmpegService.convertToPortrait).toHaveBeenCalled();
    });

    it('should handle music download failure gracefully', async () => {
      const data = createMockJobData({
        params: {
          music: 'music-id',
          sourceIds: ['source1', 'source2'],
        },
      });
      const job = createMockJob(JOB_TYPES.MERGE_VIDEOS, data);

      // First 2 calls for videos succeed, 3rd for music fails
      s3Service.downloadFile
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('Music not found'));

      await processor.handleMerge(job);

      // Should continue with merge without music
      expect(ffmpegService.mergeVideos).toHaveBeenCalled();
      expect(ffmpegService.mergeVideosWithMusic).not.toHaveBeenCalled();
    });

    it('should handle merge errors', async () => {
      const error = new Error('Merge failed');
      ffmpegService.mergeVideos.mockRejectedValue(error);

      await expect(processor.handleMerge(mockJob)).rejects.toThrow(
        'Merge failed',
      );

      expect(webSocketService.emitError).toHaveBeenCalled();
      expect(redisService.publish).toHaveBeenCalledWith(
        'background-task-update',
        expect.objectContaining({
          status: 'failed',
        }),
      );
    });

    it('should emit background task updates', async () => {
      await processor.handleMerge(mockJob);

      expect(redisService.publish).toHaveBeenCalledWith(
        'background-task-update',
        expect.objectContaining({
          status: 'processing',
        }),
      );
      expect(redisService.publish).toHaveBeenCalledWith(
        'background-task-update',
        expect.objectContaining({
          status: 'completed',
        }),
      );
    });

    it('should skip background task updates when no clerkUserId', async () => {
      const data = createMockJobData({
        clerkUserId: undefined,
        params: { sourceIds: ['source1'] },
      });
      const job = createMockJob(JOB_TYPES.MERGE_VIDEOS, data);

      await processor.handleMerge(job);

      // Should not emit background task updates
      expect(redisService.publish).not.toHaveBeenCalledWith(
        'background-task-update',
        expect.anything(),
      );
    });
  });

  // ==========================================================================
  // handleAddCaptions
  // ==========================================================================
  describe('handleAddCaptions', () => {
    it('should add captions successfully', async () => {
      const data = createMockJobData({
        params: { captionContent: '1\n00:00:00,000 --> 00:00:05,000\nHello' },
      });
      const job = createMockJob(JOB_TYPES.ADD_CAPTIONS, data);

      const result = await processor.handleAddCaptions(job);

      expect(result.success).toBe(true);
      expect(ffmpegService.addCaptions).toHaveBeenCalled();
      expect(webSocketService.emitSuccess).toHaveBeenCalled();
    });

    it('should handle caption errors', async () => {
      const data = createMockJobData({ params: { captionContent: '' } });
      const job = createMockJob(JOB_TYPES.ADD_CAPTIONS, data);
      ffmpegService.addCaptions.mockRejectedValue(new Error('Caption failed'));

      await expect(processor.handleAddCaptions(job)).rejects.toThrow();
      expect(webSocketService.emitError).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // handleVideoToGif
  // ==========================================================================
  describe('handleVideoToGif', () => {
    it('should convert video to gif successfully', async () => {
      const data = createMockJobData({
        params: { fps: 15, width: 480 },
      });
      const job = createMockJob(JOB_TYPES.VIDEO_TO_GIF, data);

      const result = await processor.handleVideoToGif(job);

      expect(result.success).toBe(true);
      expect(ffmpegService.convertToGif).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        { fps: 15, width: 480 },
        expect.any(Function),
      );
      expect(s3Service.generateS3Key).toHaveBeenCalledWith(
        'gifs',
        expect.any(String),
      );
      expect(s3Service.uploadFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        'image/gif',
      );
    });

    it('should handle gif conversion errors', async () => {
      const job = createMockJob(JOB_TYPES.VIDEO_TO_GIF, createMockJobData());
      ffmpegService.convertToGif.mockRejectedValue(new Error('GIF failed'));

      await expect(processor.handleVideoToGif(job)).rejects.toThrow(
        'GIF failed',
      );
      expect(webSocketService.emitError).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // handleReverse
  // ==========================================================================
  describe('handleReverse', () => {
    it('should reverse video successfully', async () => {
      const job = createMockJob(JOB_TYPES.REVERSE_VIDEO, createMockJobData());

      const result = await processor.handleReverse(job);

      expect(result.success).toBe(true);
      expect(ffmpegService.reverseVideo).toHaveBeenCalled();
      expect(ffmpegService.cleanupTempFiles).toHaveBeenCalledWith(
        expect.any(String),
        'reverse',
      );
    });

    it('should handle reverse errors', async () => {
      const job = createMockJob(JOB_TYPES.REVERSE_VIDEO, createMockJobData());
      ffmpegService.reverseVideo.mockRejectedValue(new Error('Reverse failed'));

      await expect(processor.handleReverse(job)).rejects.toThrow(
        'Reverse failed',
      );
    });
  });

  // ==========================================================================
  // handleMirror
  // ==========================================================================
  describe('handleMirror', () => {
    it('should mirror video successfully', async () => {
      const job = createMockJob(JOB_TYPES.MIRROR_VIDEO, createMockJobData());

      const result = await processor.handleMirror(job);

      expect(result.success).toBe(true);
      expect(ffmpegService.mirrorVideo).toHaveBeenCalled();
      expect(ffmpegService.cleanupTempFiles).toHaveBeenCalledWith(
        expect.any(String),
        'mirror',
      );
    });

    it('should handle mirror errors', async () => {
      const job = createMockJob(JOB_TYPES.MIRROR_VIDEO, createMockJobData());
      ffmpegService.mirrorVideo.mockRejectedValue(new Error('Mirror failed'));

      await expect(processor.handleMirror(job)).rejects.toThrow(
        'Mirror failed',
      );
    });
  });

  // ==========================================================================
  // handleTrim
  // ==========================================================================
  describe('handleTrim', () => {
    it('should trim video successfully', async () => {
      const data = createMockJobData({
        params: { endTime: 15, startTime: 5 },
      });
      const job = createMockJob(JOB_TYPES.TRIM_VIDEO, data);

      const result = await processor.handleTrim(job);

      expect(result.success).toBe(true);
      expect(ffmpegService.trimVideo).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        5,
        10, // duration = endTime - startTime
        expect.any(Function),
      );
      expect(redisService.publish).toHaveBeenCalledWith(
        'video-processing-complete',
        expect.objectContaining({
          result: expect.objectContaining({
            duration: 10,
            endTime: 15,
            startTime: 5,
          }),
          status: 'completed',
        }),
      );
    });

    it('should throw error for duration less than 2 seconds', async () => {
      const data = createMockJobData({
        params: { endTime: 1, startTime: 0 },
      });
      const job = createMockJob(JOB_TYPES.TRIM_VIDEO, data);

      await expect(processor.handleTrim(job)).rejects.toThrow(
        'Trim duration must be between 2 and 15 seconds',
      );
    });

    it('should throw error for duration more than 15 seconds', async () => {
      const data = createMockJobData({
        params: { endTime: 20, startTime: 0 },
      });
      const job = createMockJob(JOB_TYPES.TRIM_VIDEO, data);

      await expect(processor.handleTrim(job)).rejects.toThrow(
        'Trim duration must be between 2 and 15 seconds',
      );
    });

    it('should use default startTime of 0 when not provided', async () => {
      const data = createMockJobData({
        params: { endTime: 10, startTime: undefined },
      });
      const job = createMockJob(JOB_TYPES.TRIM_VIDEO, data);

      await processor.handleTrim(job);

      expect(ffmpegService.trimVideo).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        0,
        10,
        expect.any(Function),
      );
    });
  });

  // ==========================================================================
  // handleTextOverlay
  // ==========================================================================
  describe('handleTextOverlay', () => {
    it('should add text overlay successfully', async () => {
      const data = createMockJobData({
        params: { position: 'top', text: 'Hello World' },
      });
      const job = createMockJob(JOB_TYPES.ADD_TEXT_OVERLAY, data);

      const result = await processor.handleTextOverlay(job);

      expect(result.success).toBe(true);
      expect(ffmpegService.addTextOverlay).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        'Hello World',
        { position: 'top' },
        expect.any(Function),
      );
    });

    it('should use default position when not provided', async () => {
      const data = createMockJobData({
        params: { text: 'Test' },
      });
      const job = createMockJob(JOB_TYPES.ADD_TEXT_OVERLAY, data);

      await processor.handleTextOverlay(job);

      expect(ffmpegService.addTextOverlay).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        'Test',
        { position: 'bottom' },
        expect.any(Function),
      );
    });

    it('should handle empty text', async () => {
      const data = createMockJobData({
        params: { text: undefined },
      });
      const job = createMockJob(JOB_TYPES.ADD_TEXT_OVERLAY, data);

      await processor.handleTextOverlay(job);

      expect(ffmpegService.addTextOverlay).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        '',
        expect.any(Object),
        expect.any(Function),
      );
    });
  });

  // ==========================================================================
  // handlePortraitConversion
  // ==========================================================================
  describe('handlePortraitConversion', () => {
    it('should convert to portrait successfully', async () => {
      const data = createMockJobData({
        params: { height: 1920, width: 1080 },
      });
      const job = createMockJob(JOB_TYPES.CONVERT_TO_PORTRAIT, data);

      const result = await processor.handlePortraitConversion(job);

      expect(result.success).toBe(true);
      expect(ffmpegService.convertToPortrait).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        { height: 1920, width: 1080 },
        expect.any(Function),
      );
    });

    it('should use default dimensions when not provided', async () => {
      const data = createMockJobData({
        params: { height: undefined, width: undefined },
      });
      const job = createMockJob(JOB_TYPES.CONVERT_TO_PORTRAIT, data);

      await processor.handlePortraitConversion(job);

      expect(ffmpegService.convertToPortrait).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        { height: 1920, width: 1080 },
        expect.any(Function),
      );
    });

    it('should handle portrait conversion errors', async () => {
      const job = createMockJob(
        JOB_TYPES.CONVERT_TO_PORTRAIT,
        createMockJobData(),
      );
      ffmpegService.convertToPortrait.mockRejectedValue(
        new Error('Portrait failed'),
      );

      await expect(processor.handlePortraitConversion(job)).rejects.toThrow(
        'Portrait failed',
      );
      expect(webSocketService.emitError).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // handleVideoToAudio
  // ==========================================================================
  describe('handleVideoToAudio', () => {
    it('should convert video to audio successfully', async () => {
      const job = createMockJob(JOB_TYPES.VIDEO_TO_AUDIO, createMockJobData());

      const result = await processor.handleVideoToAudio(job);

      expect(result.success).toBe(true);
      expect(ffmpegService.convertVideoToAudio).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        {
          audioBitrate: '128k',
          audioCodec: 'libmp3lame',
          format: 'mp3',
        },
      );
      expect(s3Service.generateS3Key).toHaveBeenCalledWith(
        'audio',
        expect.any(String),
      );
      expect(s3Service.uploadFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        'audio/mpeg',
      );
    });

    it('should use custom audio options when provided', async () => {
      const data = createMockJobData({
        params: {
          audioBitrate: '256k',
          audioCodec: 'aac',
          audioFormat: 'm4a',
        },
      });
      const job = createMockJob(JOB_TYPES.VIDEO_TO_AUDIO, data);

      await processor.handleVideoToAudio(job);

      expect(ffmpegService.convertVideoToAudio).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        {
          audioBitrate: '256k',
          audioCodec: 'aac',
          format: 'm4a',
        },
      );
    });
  });

  // ==========================================================================
  // handleExtractFrames
  // ==========================================================================
  describe('handleExtractFrames', () => {
    it('should extract frames successfully', async () => {
      const data = createMockJobData({
        params: { inputPath: '/tmp/video.mp4' },
      });
      const job = createMockJob(JOB_TYPES.EXTRACT_FRAMES, data);

      const result = await processor.handleExtractFrames(job);

      expect(result.success).toBe(true);
      expect(result.frameCount).toBe(1);
      expect(ffmpegService.extractFrame).toHaveBeenCalled();
    });

    it('should use custom output directory when provided', async () => {
      const data = createMockJobData({
        params: { inputPath: '/tmp/video.mp4', outputDir: '/custom/output' },
      });
      const job = createMockJob(JOB_TYPES.EXTRACT_FRAMES, data);

      const result = await processor.handleExtractFrames(job);

      expect(result.outputPath).toBe('/custom/output');
    });

    it('should handle frame extraction errors', async () => {
      const data = createMockJobData({
        params: { inputPath: '/tmp/video.mp4' },
      });
      const job = createMockJob(JOB_TYPES.EXTRACT_FRAMES, data);
      ffmpegService.extractFrame.mockRejectedValue(
        new Error('Frame extraction failed'),
      );

      await expect(processor.handleExtractFrames(job)).rejects.toThrow(
        'Frame extraction failed',
      );
      expect(redisService.publish).toHaveBeenCalledWith(
        'video-processing-complete',
        expect.objectContaining({
          status: 'failed',
        }),
      );
    });
  });

  // ==========================================================================
  // handleGetVideoMetadata
  // ==========================================================================
  describe('handleGetVideoMetadata', () => {
    it('should get video metadata successfully', async () => {
      const data = createMockJobData({
        params: { videoPath: '/tmp/video.mp4' },
      });
      const job = createMockJob(JOB_TYPES.GET_VIDEO_METADATA, data);

      const result = await processor.handleGetVideoMetadata(job);

      expect(result.success).toBe(true);
      expect(result.metadata).toEqual({
        codec: 'h264',
        duration: 10,
        fps: 30,
        height: 1080,
        width: 1920,
      });
      expect(ffmpegService.getVideoMetadata).toHaveBeenCalledWith(
        '/tmp/video.mp4',
      );
    });

    it('should handle metadata extraction errors', async () => {
      const data = createMockJobData({
        params: { videoPath: '/tmp/video.mp4' },
      });
      const job = createMockJob(JOB_TYPES.GET_VIDEO_METADATA, data);
      ffmpegService.getVideoMetadata.mockRejectedValue(
        new Error('Metadata failed'),
      );

      await expect(processor.handleGetVideoMetadata(job)).rejects.toThrow(
        'Metadata failed',
      );
      expect(redisService.publish).toHaveBeenCalledWith(
        'video-processing-complete',
        expect.objectContaining({
          status: 'failed',
        }),
      );
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================
  describe('Edge Cases', () => {
    it('should handle download from URL when s3Key is not provided', async () => {
      const data = createMockJobData({
        params: {
          inputPath: 'https://example.com/video.mp4',
          s3Key: undefined,
        },
      });
      const job = createMockJob(JOB_TYPES.REVERSE_VIDEO, data);

      await processor.handleReverse(job);

      expect(s3Service.downloadFromUrl).toHaveBeenCalled();
      expect(s3Service.downloadFile).not.toHaveBeenCalled();
    });

    it('should handle progress callback with default percent', async () => {
      ffmpegService.resizeVideo.mockImplementation(
        (_input, _output, _w, _h, onProgress) => {
          // Progress without percent
          onProgress?.({ frames: 100, time: '00:00:05' });
          return Promise.resolve();
        },
      );

      const job = createMockJob(JOB_TYPES.RESIZE_VIDEO, createMockJobData());

      await processor.handleResize(job);

      expect(webSocketService.emitProgress).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ percent: 50 }),
        expect.any(String),
        expect.any(String),
      );
    });

    it('should handle Redis publish errors gracefully in publishVideoCompletion', async () => {
      (redisService.publish as Mock).mockRejectedValueOnce(
        new Error('Redis error'),
      );

      const job = createMockJob(JOB_TYPES.RESIZE_VIDEO, createMockJobData());

      // Should not throw, just log error
      await processor.handleResize(job);

      expect(loggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to publish video completion event'),
      );
    });
  });
});
