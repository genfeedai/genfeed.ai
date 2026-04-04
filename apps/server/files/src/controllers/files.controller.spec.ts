import { Readable } from 'node:stream';
import { ConfigService } from '@files/config/config.service';
import { FilesController } from '@files/controllers/files.controller';
import { TempFileCleanupCron } from '@files/cron/temp-file-cleanup.cron';
import { FileQueueService } from '@files/queues/file-queue.service';
import { ImageQueueService } from '@files/queues/image-queue.service';
import { JOB_TYPES } from '@files/queues/queue.constants';
import { VideoQueueService } from '@files/queues/video-queue.service';
import { YoutubeQueueService } from '@files/queues/youtube-queue.service';
import { FFmpegService } from '@files/services/ffmpeg/services/ffmpeg.service';
import { ImagesSplitService } from '@files/services/images/images-split.service';
import { S3Service } from '@files/services/s3/s3.service';
import { VideoThumbnailService } from '@files/services/thumbnails/video-thumbnail.service';
import { UploadService } from '@files/services/upload/upload.service';
import { HttpService } from '@nestjs/axios';
import { HttpException, StreamableFile } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Response } from 'express';
import { of, throwError } from 'rxjs';

// Mock fs module
vi.mock('fs', () => ({
  existsSync: vi.fn().mockReturnValue(true),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn().mockReturnValue(Buffer.from('test-content')),
  unlinkSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

// Mock path.resolve to return predictable paths
vi.mock('path', async () => ({
  ...(await vi.importActual('path')),
  basename: vi.fn((filepath) => filepath.split('/').pop()),
  extname: vi.fn((filename) => {
    const ext = filename.split('.').pop();
    return ext ? `.${ext}` : '';
  }),
  resolve: vi.fn((...args) => args.join('/')),
}));

describe('FilesController', () => {
  let controller: FilesController;
  let videoQueueService: VideoQueueService;
  let imageQueueService: ImageQueueService;
  let fileQueueService: FileQueueService;
  let youtubeQueueService: YoutubeQueueService;
  let httpService: HttpService;
  let s3Service: S3Service;
  let uploadService: UploadService;
  let videoThumbnailService: VideoThumbnailService;
  let imagesSplitService: ImagesSplitService;
  let tempFileCleanupCron: TempFileCleanupCron;
  let ffmpegService: FFmpegService;

  const mockJob = {
    data: {},
    failedReason: null,
    getState: vi.fn().mockResolvedValue('waiting'),
    id: 'job_123',
    progress: 50,
    returnvalue: { success: true },
  };

  const mockVideoQueueService = {
    addCaptionsJob: vi.fn().mockResolvedValue(mockJob),
    addExtractFramesJob: vi.fn().mockResolvedValue(mockJob),
    addGetVideoMetadataJob: vi.fn().mockResolvedValue(mockJob),
    addGifConversionJob: vi.fn().mockResolvedValue(mockJob),
    addMergeJob: vi.fn().mockResolvedValue(mockJob),
    addMirrorJob: vi.fn().mockResolvedValue(mockJob),
    addPortraitConversionJob: vi.fn().mockResolvedValue(mockJob),
    addResizeJob: vi.fn().mockResolvedValue(mockJob),
    addResizeVideoJob: vi.fn().mockResolvedValue(mockJob),
    addReverseJob: vi.fn().mockResolvedValue(mockJob),
    addTextOverlayJob: vi.fn().mockResolvedValue(mockJob),
    addTrimJob: vi.fn().mockResolvedValue(mockJob),
    addVideoToAudioJob: vi.fn().mockResolvedValue(mockJob),
    getJob: vi.fn(),
    getJobCounts: vi.fn().mockResolvedValue({
      active: 2,
      completed: 100,
      failed: 1,
      waiting: 5,
    }),
  };

  const mockImageQueueService = {
    addImageToVideoJob: vi.fn().mockResolvedValue(mockJob),
    addKenBurnsJob: vi.fn().mockResolvedValue(mockJob),
    addPortraitBlurJob: vi.fn().mockResolvedValue(mockJob),
    addResizeImageJob: vi.fn().mockResolvedValue(mockJob),
    addSplitScreenJob: vi.fn().mockResolvedValue(mockJob),
    getJob: vi.fn(),
    getJobCounts: vi.fn().mockResolvedValue({
      active: 1,
      completed: 50,
      failed: 0,
      waiting: 3,
    }),
  };

  const mockFileQueueService = {
    addCaptionsOverlayJob: vi.fn().mockResolvedValue(mockJob),
    addCleanupJob: vi.fn().mockResolvedValue(mockJob),
    addClipsJob: vi.fn().mockResolvedValue(mockJob),
    addDownloadJob: vi.fn().mockResolvedValue(mockJob),
    addPrepareFilesJob: vi.fn().mockResolvedValue(mockJob),
    addUploadToS3Job: vi.fn().mockResolvedValue(mockJob),
    addWatermarkJob: vi.fn().mockResolvedValue(mockJob),
    getJob: vi.fn(),
    getJobCounts: vi.fn().mockResolvedValue({
      active: 0,
      completed: 75,
      failed: 2,
      waiting: 2,
    }),
  };

  const mockYoutubeQueueService = {
    addUploadJob: vi.fn().mockResolvedValue(mockJob),
    getJob: vi.fn(),
  };

  const mockConfigService = {
    get: vi.fn((key: string) => {
      if (key === 'WEBSOCKET_URL') {
        return 'ws://localhost:3000';
      }
      return null;
    }),
  };

  const mockFFmpegService = {
    getVideoMetadata: vi.fn().mockResolvedValue({
      codec: 'h264',
      duration: 120,
      fps: 30,
      height: 1080,
      width: 1920,
    }),
  };

  const mockHttpService = {
    get: vi.fn(),
  };

  const mockS3Service = {
    copyFile: vi.fn().mockResolvedValue(undefined),
    generateS3Key: vi.fn((type, key) => `ingredients/${type}/${key}`),
    getFileStream: vi.fn().mockResolvedValue(Readable.from(['test'])),
    getPresignedDownloadUrl: vi
      .fn()
      .mockResolvedValue('https://s3.presigned.download.url'),
    getPresignedUploadUrl: vi.fn().mockResolvedValue({
      publicUrl: 'https://s3.public.url',
      uploadUrl: 'https://s3.presigned.upload.url',
    }),
    getPublicUrl: vi.fn((key) => `https://s3.amazonaws.com/bucket/${key}`),
  };

  const mockUploadService = {
    uploadToS3: vi.fn().mockResolvedValue({
      key: 'ingredients/video/uploaded-file.mp4',
      publicUrl: 'https://s3.amazonaws.com/uploaded-file.mp4',
    }),
  };

  const mockVideoThumbnailService = {
    generateThumbnail: vi
      .fn()
      .mockResolvedValue('https://s3.amazonaws.com/thumbnail.jpg'),
  };

  const mockImagesSplitService = {
    splitImage: vi.fn().mockResolvedValue([
      { buffer: Buffer.from('frame1'), height: 512, width: 512 },
      { buffer: Buffer.from('frame2'), height: 512, width: 512 },
      { buffer: Buffer.from('frame3'), height: 512, width: 512 },
      { buffer: Buffer.from('frame4'), height: 512, width: 512 },
    ]),
  };

  const mockTempFileCleanupCron = {
    manualCleanup: vi.fn().mockResolvedValue({
      filesDeleted: 5,
      message: 'Cleanup completed',
      totalFiles: 10,
    }),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const fs = require('node:fs');
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(Buffer.from('test-content'));
    fs.writeFileSync.mockImplementation(() => undefined);
    fs.mkdirSync.mockImplementation(() => undefined);
    fs.unlinkSync.mockImplementation(() => undefined);

    const path = require('node:path');
    path.resolve.mockImplementation((...args: string[]) => args.join('/'));
    path.basename.mockImplementation((filepath: string) =>
      filepath.split('/').pop(),
    );
    path.extname.mockImplementation((filename: string) => {
      const ext = filename.split('.').pop();
      return ext ? `.${ext}` : '';
    });

    mockVideoQueueService.addCaptionsJob.mockResolvedValue(mockJob);
    mockVideoQueueService.addExtractFramesJob.mockResolvedValue(mockJob);
    mockVideoQueueService.addGetVideoMetadataJob.mockResolvedValue(mockJob);
    mockVideoQueueService.addGifConversionJob.mockResolvedValue(mockJob);
    mockVideoQueueService.addMergeJob.mockResolvedValue(mockJob);
    mockVideoQueueService.addMirrorJob.mockResolvedValue(mockJob);
    mockVideoQueueService.addPortraitConversionJob.mockResolvedValue(mockJob);
    mockVideoQueueService.addResizeJob.mockResolvedValue(mockJob);
    mockVideoQueueService.addResizeVideoJob.mockResolvedValue(mockJob);
    mockVideoQueueService.addReverseJob.mockResolvedValue(mockJob);
    mockVideoQueueService.addTextOverlayJob.mockResolvedValue(mockJob);
    mockVideoQueueService.addTrimJob.mockResolvedValue(mockJob);
    mockVideoQueueService.addVideoToAudioJob.mockResolvedValue(mockJob);
    mockVideoQueueService.getJobCounts.mockResolvedValue({
      active: 2,
      completed: 100,
      failed: 1,
      waiting: 5,
    });

    mockJob.getState.mockResolvedValue('waiting');

    mockVideoQueueService.getJob.mockResolvedValue(mockJob);

    mockImageQueueService.addImageToVideoJob.mockResolvedValue(mockJob);
    mockImageQueueService.addKenBurnsJob.mockResolvedValue(mockJob);
    mockImageQueueService.addPortraitBlurJob.mockResolvedValue(mockJob);
    mockImageQueueService.addResizeImageJob.mockResolvedValue(mockJob);
    mockImageQueueService.addSplitScreenJob.mockResolvedValue(mockJob);
    mockImageQueueService.getJob.mockResolvedValue(mockJob);
    mockImageQueueService.getJobCounts.mockResolvedValue({
      active: 1,
      completed: 50,
      failed: 0,
      waiting: 3,
    });

    mockFileQueueService.addCaptionsOverlayJob.mockResolvedValue(mockJob);
    mockFileQueueService.addCleanupJob.mockResolvedValue(mockJob);
    mockFileQueueService.addClipsJob.mockResolvedValue(mockJob);
    mockFileQueueService.addDownloadJob.mockResolvedValue(mockJob);
    mockFileQueueService.addPrepareFilesJob.mockResolvedValue(mockJob);
    mockFileQueueService.addUploadToS3Job.mockResolvedValue(mockJob);
    mockFileQueueService.addWatermarkJob.mockResolvedValue(mockJob);
    mockFileQueueService.getJob.mockResolvedValue(mockJob);
    mockFileQueueService.getJobCounts.mockResolvedValue({
      active: 0,
      completed: 75,
      failed: 2,
      waiting: 2,
    });

    mockYoutubeQueueService.addUploadJob.mockResolvedValue(mockJob);
    mockYoutubeQueueService.getJob.mockResolvedValue(mockJob);

    mockS3Service.copyFile.mockResolvedValue(undefined);
    mockS3Service.generateS3Key.mockImplementation(
      (type: string, key: string) => `ingredients/${type}/${key}`,
    );
    mockS3Service.getFileStream.mockResolvedValue(Readable.from(['test']));
    mockS3Service.getPresignedDownloadUrl.mockResolvedValue(
      'https://s3.presigned.download.url',
    );
    mockS3Service.getPresignedUploadUrl.mockResolvedValue({
      publicUrl: 'https://s3.public.url',
      uploadUrl: 'https://s3.presigned.upload.url',
    });
    mockS3Service.getPublicUrl.mockImplementation(
      (key: string) => `https://s3.amazonaws.com/bucket/${key}`,
    );

    mockUploadService.uploadToS3.mockResolvedValue({
      key: 'ingredients/video/uploaded-file.mp4',
      publicUrl: 'https://s3.amazonaws.com/uploaded-file.mp4',
    });

    mockVideoThumbnailService.generateThumbnail.mockResolvedValue(
      'https://s3.amazonaws.com/thumbnail.jpg',
    );

    mockImagesSplitService.splitImage.mockResolvedValue([
      { buffer: Buffer.from('frame1'), height: 512, width: 512 },
      { buffer: Buffer.from('frame2'), height: 512, width: 512 },
      { buffer: Buffer.from('frame3'), height: 512, width: 512 },
      { buffer: Buffer.from('frame4'), height: 512, width: 512 },
    ]);

    mockTempFileCleanupCron.manualCleanup.mockResolvedValue({
      filesDeleted: 5,
      message: 'Cleanup completed',
      totalFiles: 10,
    });

    mockFFmpegService.getVideoMetadata.mockResolvedValue({
      codec: 'h264',
      duration: 120,
      fps: 30,
      height: 1080,
      width: 1920,
    });

    const module: TestingModule = await Test.createTestingModule({
      controllers: [FilesController],
      providers: [
        { provide: ConfigService, useValue: mockConfigService },
        { provide: FileQueueService, useValue: mockFileQueueService },
        { provide: FFmpegService, useValue: mockFFmpegService },
        { provide: HttpService, useValue: mockHttpService },
        { provide: ImageQueueService, useValue: mockImageQueueService },
        { provide: ImagesSplitService, useValue: mockImagesSplitService },
        { provide: S3Service, useValue: mockS3Service },
        { provide: TempFileCleanupCron, useValue: mockTempFileCleanupCron },
        { provide: UploadService, useValue: mockUploadService },
        { provide: VideoQueueService, useValue: mockVideoQueueService },
        { provide: VideoThumbnailService, useValue: mockVideoThumbnailService },
        { provide: YoutubeQueueService, useValue: mockYoutubeQueueService },
      ],
    }).compile();

    controller = module.get<FilesController>(FilesController);
    videoQueueService = module.get<VideoQueueService>(VideoQueueService);
    imageQueueService = module.get<ImageQueueService>(ImageQueueService);
    fileQueueService = module.get<FileQueueService>(FileQueueService);
    youtubeQueueService = module.get<YoutubeQueueService>(YoutubeQueueService);
    httpService = module.get<HttpService>(HttpService);
    s3Service = module.get<S3Service>(S3Service);
    uploadService = module.get<UploadService>(UploadService);
    videoThumbnailService = module.get<VideoThumbnailService>(
      VideoThumbnailService,
    );
    imagesSplitService = module.get<ImagesSplitService>(ImagesSplitService);
    tempFileCleanupCron = module.get<TempFileCleanupCron>(TempFileCleanupCron);
    ffmpegService = module.get<FFmpegService>(FFmpegService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // Initialization
  // ==========================================================================
  describe('initialization', () => {
    it('should be defined', () => {
      expect(controller).toBeDefined();
    });

    it('should have all required dependencies injected', () => {
      expect(videoQueueService).toBeDefined();
      expect(imageQueueService).toBeDefined();
      expect(fileQueueService).toBeDefined();
      expect(youtubeQueueService).toBeDefined();
      expect(httpService).toBeDefined();
      expect(s3Service).toBeDefined();
      expect(uploadService).toBeDefined();
      expect(videoThumbnailService).toBeDefined();
      expect(imagesSplitService).toBeDefined();
      expect(tempFileCleanupCron).toBeDefined();
      expect(ffmpegService).toBeDefined();
    });
  });

  // ==========================================================================
  // processVideo
  // ==========================================================================
  describe('processVideo', () => {
    const baseBody = {
      clerkUserId: 'clerk_123',
      ingredientId: 'ingredient_123',
      organizationId: 'org_123',
      params: { height: 1080, width: 1920 },
      room: 'room_123',
      userId: 'user_123',
    };

    it('should process RESIZE_VIDEO job', async () => {
      const body = { ...baseBody, type: JOB_TYPES.RESIZE_VIDEO };
      const result = await controller.processVideo(body);

      expect(videoQueueService.addResizeVideoJob).toHaveBeenCalled();
      expect(result.jobId).toBe('job_123');
      expect(result.type).toBe(JOB_TYPES.RESIZE_VIDEO);
    });

    it('should process MERGE_VIDEOS job', async () => {
      const body = {
        ...baseBody,
        params: { sourceIds: ['id1', 'id2'] },
        type: JOB_TYPES.MERGE_VIDEOS,
      };
      const result = await controller.processVideo(body);

      expect(videoQueueService.addMergeJob).toHaveBeenCalled();
      expect(result.jobId).toBe('job_123');
    });

    it('should process ADD_CAPTIONS job', async () => {
      const body = {
        ...baseBody,
        params: { captionContent: 'Test' },
        type: JOB_TYPES.ADD_CAPTIONS,
      };
      const result = await controller.processVideo(body);

      expect(videoQueueService.addCaptionsJob).toHaveBeenCalled();
      expect(result.jobId).toBe('job_123');
    });

    it('should process VIDEO_TO_GIF job', async () => {
      const body = { ...baseBody, type: JOB_TYPES.VIDEO_TO_GIF };
      const result = await controller.processVideo(body);

      expect(videoQueueService.addGifConversionJob).toHaveBeenCalled();
      expect(result.jobId).toBe('job_123');
    });

    it('should process REVERSE_VIDEO job', async () => {
      const body = { ...baseBody, type: JOB_TYPES.REVERSE_VIDEO };
      const result = await controller.processVideo(body);

      expect(videoQueueService.addReverseJob).toHaveBeenCalled();
      expect(result.jobId).toBe('job_123');
    });

    it('should process MIRROR_VIDEO job', async () => {
      const body = { ...baseBody, type: JOB_TYPES.MIRROR_VIDEO };
      const result = await controller.processVideo(body);

      expect(videoQueueService.addMirrorJob).toHaveBeenCalled();
      expect(result.jobId).toBe('job_123');
    });

    it('should process ADD_TEXT_OVERLAY job', async () => {
      const body = {
        ...baseBody,
        params: { text: 'Hello' },
        type: JOB_TYPES.ADD_TEXT_OVERLAY,
      };
      const result = await controller.processVideo(body);

      expect(videoQueueService.addTextOverlayJob).toHaveBeenCalled();
      expect(result.jobId).toBe('job_123');
    });

    it('should process CONVERT_TO_PORTRAIT job', async () => {
      const body = { ...baseBody, type: JOB_TYPES.CONVERT_TO_PORTRAIT };
      const result = await controller.processVideo(body);

      expect(videoQueueService.addPortraitConversionJob).toHaveBeenCalled();
      expect(result.jobId).toBe('job_123');
    });

    it('should process VIDEO_TO_AUDIO job', async () => {
      const body = { ...baseBody, type: JOB_TYPES.VIDEO_TO_AUDIO };
      const result = await controller.processVideo(body);

      expect(videoQueueService.addVideoToAudioJob).toHaveBeenCalled();
      expect(result.jobId).toBe('job_123');
    });

    it('should process TRIM_VIDEO job', async () => {
      const body = {
        ...baseBody,
        params: { endTime: 10, startTime: 0 },
        type: JOB_TYPES.TRIM_VIDEO,
      };
      const result = await controller.processVideo(body);

      expect(videoQueueService.addTrimJob).toHaveBeenCalled();
      expect(result.jobId).toBe('job_123');
    });

    it('should process EXTRACT_FRAMES job', async () => {
      const body = { ...baseBody, type: JOB_TYPES.EXTRACT_FRAMES };
      const result = await controller.processVideo(body);

      expect(videoQueueService.addExtractFramesJob).toHaveBeenCalled();
      expect(result.jobId).toBe('job_123');
    });

    it('should process GET_VIDEO_METADATA job', async () => {
      const body = { ...baseBody, type: JOB_TYPES.GET_VIDEO_METADATA };
      const result = await controller.processVideo(body);

      expect(videoQueueService.addGetVideoMetadataJob).toHaveBeenCalled();
      expect(result.jobId).toBe('job_123');
    });

    it('should throw error for unknown video type', async () => {
      const body = { ...baseBody, type: 'unknown-type' };

      await expect(controller.processVideo(body)).rejects.toThrow(
        HttpException,
      );
      await expect(controller.processVideo(body)).rejects.toThrow(
        'Unknown video processing type',
      );
    });

    it('should use default priority when not provided', async () => {
      const body = { ...baseBody, type: JOB_TYPES.RESIZE_VIDEO };
      await controller.processVideo(body);

      expect(videoQueueService.addResizeVideoJob).toHaveBeenCalledWith(
        expect.objectContaining({
          priority: expect.any(Number),
        }),
      );
    });

    it('should generate unique id when not provided', async () => {
      const body = { ...baseBody, type: JOB_TYPES.RESIZE_VIDEO };
      await controller.processVideo(body);

      expect(videoQueueService.addResizeVideoJob).toHaveBeenCalledWith(
        expect.objectContaining({
          id: expect.stringContaining('video-'),
        }),
      );
    });

    it('should handle queue service errors', async () => {
      mockVideoQueueService.addResizeVideoJob.mockRejectedValueOnce(
        new Error('Queue unavailable'),
      );

      const body = { ...baseBody, type: JOB_TYPES.RESIZE_VIDEO };

      await expect(controller.processVideo(body)).rejects.toThrow(
        HttpException,
      );
    });
  });

  // ==========================================================================
  // processImage
  // ==========================================================================
  describe('processImage', () => {
    const baseBody = {
      ingredientId: 'ingredient_123',
      organizationId: 'org_123',
      params: {},
      userId: 'user_123',
    };

    it('should process image-to-video job', async () => {
      const body = {
        ...baseBody,
        params: { duration: 5 },
        type: 'image-to-video',
      };
      const result = await controller.processImage(body);

      expect(imageQueueService.addImageToVideoJob).toHaveBeenCalled();
      expect(result.jobId).toBe('job_123');
      expect(result.type).toBe('image-to-video');
    });

    it('should process ken-burns-effect job', async () => {
      const body = { ...baseBody, type: 'ken-burns-effect' };
      const result = await controller.processImage(body);

      expect(imageQueueService.addKenBurnsJob).toHaveBeenCalled();
      expect(result.jobId).toBe('job_123');
    });

    it('should process split-screen job', async () => {
      const body = { ...baseBody, type: 'split-screen' };
      const result = await controller.processImage(body);

      expect(imageQueueService.addSplitScreenJob).toHaveBeenCalled();
      expect(result.jobId).toBe('job_123');
    });

    it('should process portrait-blur job', async () => {
      const body = { ...baseBody, type: 'portrait-blur' };
      const result = await controller.processImage(body);

      expect(imageQueueService.addPortraitBlurJob).toHaveBeenCalled();
      expect(result.jobId).toBe('job_123');
    });

    it('should process resize-image job', async () => {
      const body = {
        ...baseBody,
        params: { height: 600, width: 800 },
        type: 'resize-image',
      };
      const result = await controller.processImage(body);

      expect(imageQueueService.addResizeImageJob).toHaveBeenCalled();
      expect(result.jobId).toBe('job_123');
    });

    it('should throw error for unknown image type', async () => {
      const body = { ...baseBody, type: 'unknown-image-type' };

      await expect(controller.processImage(body)).rejects.toThrow(
        HttpException,
      );
      await expect(controller.processImage(body)).rejects.toThrow(
        'Unknown image processing type',
      );
    });

    it('should handle queue service errors', async () => {
      mockImageQueueService.addImageToVideoJob.mockRejectedValueOnce(
        new Error('Queue error'),
      );

      const body = { ...baseBody, type: 'image-to-video' };

      await expect(controller.processImage(body)).rejects.toThrow(
        HttpException,
      );
    });
  });

  // ==========================================================================
  // processFile
  // ==========================================================================
  describe('processFile', () => {
    const baseBody = {
      ingredientId: 'ingredient_123',
      organizationId: 'org_123',
      params: {},
      userId: 'user_123',
    };

    it('should process download-file job', async () => {
      const body = {
        ...baseBody,
        type: 'download-file',
        url: 'https://example.com/file.mp4',
      };
      const result = await controller.processFile(body);

      expect(fileQueueService.addDownloadJob).toHaveBeenCalled();
      expect(result.jobId).toBe('job_123');
      expect(result.type).toBe('download-file');
    });

    it('should process prepare-all-files job', async () => {
      const body = { ...baseBody, type: 'prepare-all-files' };
      const result = await controller.processFile(body);

      expect(fileQueueService.addPrepareFilesJob).toHaveBeenCalled();
      expect(result.jobId).toBe('job_123');
    });

    it('should process cleanup-temp-files job', async () => {
      const body = { ...baseBody, type: 'cleanup-temp-files' };
      const result = await controller.processFile(body);

      expect(fileQueueService.addCleanupJob).toHaveBeenCalled();
      expect(result.jobId).toBe('job_123');
    });

    it('should process upload-to-s3 job', async () => {
      const body = {
        ...baseBody,
        filePath: '/path/to/file.mp4',
        type: 'upload-to-s3',
      };
      const result = await controller.processFile(body);

      expect(fileQueueService.addUploadToS3Job).toHaveBeenCalled();
      expect(result.jobId).toBe('job_123');
    });

    it('should process add-watermark job', async () => {
      const body = { ...baseBody, type: 'add-watermark' };
      const result = await controller.processFile(body);

      expect(fileQueueService.addWatermarkJob).toHaveBeenCalled();
      expect(result.jobId).toBe('job_123');
    });

    it('should process create-clips job', async () => {
      const body = { ...baseBody, type: 'create-clips' };
      const result = await controller.processFile(body);

      expect(fileQueueService.addClipsJob).toHaveBeenCalled();
      expect(result.jobId).toBe('job_123');
    });

    it('should process add-captions-overlay job', async () => {
      const body = { ...baseBody, type: 'add-captions-overlay' };
      const result = await controller.processFile(body);

      expect(fileQueueService.addCaptionsOverlayJob).toHaveBeenCalled();
      expect(result.jobId).toBe('job_123');
    });

    it('should throw error for unknown file type', async () => {
      const body = { ...baseBody, type: 'unknown-file-type' };

      await expect(controller.processFile(body)).rejects.toThrow(HttpException);
      await expect(controller.processFile(body)).rejects.toThrow(
        'Unknown file processing type',
      );
    });

    it('should include delay in job data when provided', async () => {
      const body = {
        ...baseBody,
        delay: 5000,
        type: 'download-file',
      };
      await controller.processFile(body);

      expect(fileQueueService.addDownloadJob).toHaveBeenCalledWith(
        expect.objectContaining({ delay: 5000 }),
      );
    });
  });

  // ==========================================================================
  // processYoutube
  // ==========================================================================
  describe('processYoutube', () => {
    const baseBody = {
      brandId: 'brand_123',
      clerkUserId: 'clerk_123',
      credential: {
        accessToken: 'access_token',
        clientId: 'client_id',
        clientSecret: 'client_secret',
        redirectUri: 'https://redirect.uri',
        refreshToken: 'refresh_token',
      },
      description: 'Test Description',
      ingredientId: 'ingredient_123',
      organizationId: 'org_123',
      postId: 'post_123',
      tags: ['tag1', 'tag2'],
      title: 'Test Video',
      userId: 'user_123',
    };

    it('should process youtube upload job', async () => {
      const result = await controller.processYoutube(baseBody);

      expect(youtubeQueueService.addUploadJob).toHaveBeenCalled();
      expect(result.jobId).toBe('job_123');
      expect(result.type).toBe('upload-youtube');
      expect(result.postId).toBe('post_123');
    });

    it('should default to unlisted status', async () => {
      await controller.processYoutube(baseBody);

      expect(youtubeQueueService.addUploadJob).toHaveBeenCalledWith(
        expect.objectContaining({
          isUnlisted: true,
          status: 'unlisted',
        }),
      );
    });

    it('should handle public status', async () => {
      await controller.processYoutube({ ...baseBody, status: 'public' });

      expect(youtubeQueueService.addUploadJob).toHaveBeenCalledWith(
        expect.objectContaining({
          isUnlisted: false,
          status: 'public',
        }),
      );
    });

    it('should handle scheduled status with date', async () => {
      const scheduledDate = '2025-01-15T10:00:00Z';
      await controller.processYoutube({
        ...baseBody,
        scheduledDate,
        status: 'scheduled',
      });

      expect(youtubeQueueService.addUploadJob).toHaveBeenCalledWith(
        expect.objectContaining({
          scheduledDate,
          status: 'scheduled',
        }),
      );
    });

    it('should handle queue service errors', async () => {
      mockYoutubeQueueService.addUploadJob.mockRejectedValueOnce(
        new Error('YouTube API error'),
      );

      await expect(controller.processYoutube(baseBody)).rejects.toThrow(
        HttpException,
      );
    });
  });

  // ==========================================================================
  // getJobStatus
  // ==========================================================================
  describe('getJobStatus', () => {
    it('should return job status from video queue', async () => {
      mockVideoQueueService.getJob.mockResolvedValueOnce(mockJob);

      const result = await controller.getJobStatus('job_123');

      expect(result.jobId).toBe('job_123');
      expect(result.state).toBe('waiting');
      expect(result.progress).toBe(50);
      expect(result.result).toEqual({ success: true });
    });

    it('should check image queue if not in video queue', async () => {
      mockVideoQueueService.getJob.mockResolvedValueOnce(null);
      mockImageQueueService.getJob.mockResolvedValueOnce(mockJob);

      const result = await controller.getJobStatus('job_123');

      expect(result.jobId).toBe('job_123');
    });

    it('should check file queue if not in video or image queue', async () => {
      mockVideoQueueService.getJob.mockResolvedValueOnce(null);
      mockImageQueueService.getJob.mockResolvedValueOnce(null);
      mockFileQueueService.getJob.mockResolvedValueOnce(mockJob);

      const result = await controller.getJobStatus('job_123');

      expect(result.jobId).toBe('job_123');
    });

    it('should check youtube queue if not in other queues', async () => {
      mockVideoQueueService.getJob.mockResolvedValueOnce(null);
      mockImageQueueService.getJob.mockResolvedValueOnce(null);
      mockFileQueueService.getJob.mockResolvedValueOnce(null);
      mockYoutubeQueueService.getJob.mockResolvedValueOnce(mockJob);

      const result = await controller.getJobStatus('job_123');

      expect(result.jobId).toBe('job_123');
    });

    it('should throw 404 if job not found in any queue', async () => {
      mockVideoQueueService.getJob.mockResolvedValueOnce(null);
      mockImageQueueService.getJob.mockResolvedValueOnce(null);
      mockFileQueueService.getJob.mockResolvedValueOnce(null);
      mockYoutubeQueueService.getJob.mockResolvedValueOnce(null);

      await expect(controller.getJobStatus('job_123')).rejects.toThrow(
        'Job not found',
      );
    });

    it('should include failed reason for failed jobs', async () => {
      const failedJob = {
        ...mockJob,
        failedReason: 'Processing failed due to timeout',
      };
      mockVideoQueueService.getJob.mockResolvedValueOnce(failedJob);

      const result = await controller.getJobStatus('job_123');

      expect(result.failedReason).toBe('Processing failed due to timeout');
    });
  });

  // ==========================================================================
  // getQueueStats
  // ==========================================================================
  describe('getQueueStats', () => {
    it('should return statistics for all queues', async () => {
      const result = await controller.getQueueStats();

      expect(result.video).toEqual({
        active: 2,
        completed: 100,
        failed: 1,
        waiting: 5,
      });
      expect(result.image).toEqual({
        active: 1,
        completed: 50,
        failed: 0,
        waiting: 3,
      });
      expect(result.file).toEqual({
        active: 0,
        completed: 75,
        failed: 2,
        waiting: 2,
      });
      expect(result.timestamp).toBeDefined();
    });

    it('should handle queue stats errors', async () => {
      mockVideoQueueService.getJobCounts.mockRejectedValueOnce(
        new Error('Queue error'),
      );

      await expect(controller.getQueueStats()).rejects.toThrow(HttpException);
    });
  });

  // ==========================================================================
  // generateThumbnail
  // ==========================================================================
  describe('generateThumbnail', () => {
    it('should generate thumbnail successfully', async () => {
      const body = {
        ingredientId: 'ingredient_123',
        timeInSeconds: 5,
        videoUrl: 'https://example.com/video.mp4',
        width: 320,
      };

      const result = await controller.generateThumbnail(body);

      expect(videoThumbnailService.generateThumbnail).toHaveBeenCalledWith(
        'https://example.com/video.mp4',
        'ingredient_123',
        5,
        320,
      );
      expect(result.thumbnailUrl).toBe(
        'https://s3.amazonaws.com/thumbnail.jpg',
      );
      expect(result.ingredientId).toBe('ingredient_123');
    });

    it('should throw error if videoUrl is missing', async () => {
      const body = { ingredientId: 'ingredient_123' } as any;

      await expect(controller.generateThumbnail(body)).rejects.toThrow(
        HttpException,
      );
      await expect(controller.generateThumbnail(body)).rejects.toThrow(
        'videoUrl and ingredientId are required',
      );
    });

    it('should throw error if ingredientId is missing', async () => {
      const body = { videoUrl: 'https://example.com/video.mp4' } as any;

      await expect(controller.generateThumbnail(body)).rejects.toThrow(
        HttpException,
      );
      await expect(controller.generateThumbnail(body)).rejects.toThrow(
        'videoUrl and ingredientId are required',
      );
    });

    it('should handle thumbnail generation errors', async () => {
      mockVideoThumbnailService.generateThumbnail.mockRejectedValueOnce(
        new Error('Thumbnail generation failed'),
      );

      const body = {
        ingredientId: 'ingredient_123',
        videoUrl: 'https://example.com/video.mp4',
      };

      await expect(controller.generateThumbnail(body)).rejects.toThrow(
        HttpException,
      );
    });
  });

  // ==========================================================================
  // splitImage
  // ==========================================================================
  describe('splitImage', () => {
    it('should split image successfully', async () => {
      mockHttpService.get.mockReturnValueOnce(
        of({
          data: Buffer.from('image-data'),
          headers: { 'content-type': 'image/png' },
        }),
      );

      const body = {
        borderInset: 10,
        gridCols: 2,
        gridRows: 2,
        imageUrl: 'https://example.com/contact-sheet.png',
      };

      const result = await controller.splitImage(body);

      expect(imagesSplitService.splitImage).toHaveBeenCalled();
      expect(result.frames).toHaveLength(4);
      expect(result.count).toBe(4);
      expect(result.gridRows).toBe(2);
      expect(result.gridCols).toBe(2);
    });

    it('should throw error if imageUrl is missing', async () => {
      const body = { gridCols: 2, gridRows: 2 } as any;

      await expect(controller.splitImage(body)).rejects.toThrow(HttpException);
      await expect(controller.splitImage(body)).rejects.toThrow(
        'imageUrl, gridRows, and gridCols are required',
      );
    });

    it('should throw error if grid dimensions are invalid (< 2)', async () => {
      const body = {
        gridCols: 2,
        gridRows: 1,
        imageUrl: 'https://example.com/image.png',
      };

      await expect(controller.splitImage(body)).rejects.toThrow(HttpException);
      await expect(controller.splitImage(body)).rejects.toThrow(
        'gridRows and gridCols must be between 2 and 4',
      );
    });

    it('should throw error if grid dimensions are invalid (> 4)', async () => {
      const body = {
        gridCols: 2,
        gridRows: 5,
        imageUrl: 'https://example.com/image.png',
      };

      await expect(controller.splitImage(body)).rejects.toThrow(HttpException);
      await expect(controller.splitImage(body)).rejects.toThrow(
        'gridRows and gridCols must be between 2 and 4',
      );
    });

    it('should use default border inset of 10 when not provided', async () => {
      mockHttpService.get.mockReturnValueOnce(
        of({
          data: Buffer.from('image-data'),
          headers: { 'content-type': 'image/png' },
        }),
      );

      const body = {
        gridCols: 2,
        gridRows: 2,
        imageUrl: 'https://example.com/image.png',
      };

      await controller.splitImage(body);

      expect(imagesSplitService.splitImage).toHaveBeenCalledWith(
        expect.any(Buffer),
        2,
        2,
        10,
      );
    });

    it('should handle image download errors', async () => {
      mockHttpService.get.mockReturnValueOnce(
        throwError(() => new Error('Download failed')),
      );

      const body = {
        gridCols: 2,
        gridRows: 2,
        imageUrl: 'https://example.com/image.png',
      };

      await expect(controller.splitImage(body)).rejects.toThrow(HttpException);
    });
  });

  // ==========================================================================
  // getFileMetadata
  // ==========================================================================
  describe('getFileMetadata', () => {
    it('should return metadata for local file', async () => {
      const body = { filePath: '/path/to/video.mp4' };

      const result = await controller.getFileMetadata(body);

      expect(ffmpegService.getVideoMetadata).toHaveBeenCalledWith(
        '/path/to/video.mp4',
      );
      expect(result.duration).toBe(120);
      expect(result.width).toBe(1920);
      expect(result.height).toBe(1080);
    });

    it('should download and return metadata for URL', async () => {
      mockHttpService.get.mockReturnValueOnce(
        of({
          data: Buffer.from('video-data'),
          headers: { 'content-type': 'video/mp4' },
        }),
      );

      const body = { url: 'https://example.com/video.mp4' };

      const result = await controller.getFileMetadata(body);

      expect(httpService.get).toHaveBeenCalledWith(
        'https://example.com/video.mp4',
        expect.objectContaining({
          responseType: 'arraybuffer',
        }),
      );
      expect(result.duration).toBe(120);
    });

    it('should throw error if neither filePath nor url provided', async () => {
      const body = {};

      await expect(controller.getFileMetadata(body)).rejects.toThrow(
        HttpException,
      );
      await expect(controller.getFileMetadata(body)).rejects.toThrow(
        'Either filePath or url is required',
      );
    });

    it('should handle 404 error when downloading URL', async () => {
      mockHttpService.get.mockReturnValueOnce(
        throwError(() => ({
          message: 'Not found',
          response: { status: 404 },
        })),
      );

      const body = { url: 'https://example.com/nonexistent.mp4' };

      await expect(controller.getFileMetadata(body)).rejects.toThrow(
        HttpException,
      );
    });

    it('should handle 403 error when downloading URL', async () => {
      mockHttpService.get.mockReturnValueOnce(
        throwError(() => ({
          message: 'Forbidden',
          response: { status: 403 },
        })),
      );

      const body = { url: 'https://example.com/protected.mp4' };

      await expect(controller.getFileMetadata(body)).rejects.toThrow(
        HttpException,
      );
    });

    it('should handle file size exceeded error', async () => {
      mockHttpService.get.mockReturnValueOnce(
        throwError(() => ({
          code: 'ERR_FR_MAX_BODY_LENGTH_EXCEEDED',
          message: 'Size exceeded',
        })),
      );

      const body = { url: 'https://example.com/large-file.mp4' };

      await expect(controller.getFileMetadata(body)).rejects.toThrow(
        HttpException,
      );
    });

    it('should handle ValidationException for non-existent file', async () => {
      const error = new Error('File does not exist');
      error.name = 'ValidationException';
      mockFFmpegService.getVideoMetadata.mockRejectedValueOnce(error);

      const body = { filePath: '/nonexistent/path.mp4' };

      await expect(controller.getFileMetadata(body)).rejects.toThrow(
        HttpException,
      );
    });
  });

  // ==========================================================================
  // getTempFile
  // ==========================================================================
  describe('getTempFile', () => {
    it('should return temp file', async () => {
      const fs = require('node:fs');
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(Buffer.from('test-content'));

      const result = await controller.getTempFile('test-file.mp4');

      expect(result.buffer).toBeDefined();
      expect(result.contentType).toBe('video/mp4');
      expect(result.filename).toBe('test-file.mp4');
    });

    it('should throw error for path traversal attempt', async () => {
      const path = require('node:path');
      path.resolve.mockImplementation((...args: string[]) => args.join('/'));

      // Mock to simulate path traversal detection
      const fs = require('node:fs');
      fs.existsSync.mockReturnValue(false);

      await expect(
        controller.getTempFile('../../../etc/passwd'),
      ).rejects.toThrow(HttpException);
    });

    it('should throw 404 if file not found', async () => {
      const fs = require('node:fs');
      fs.existsSync.mockReturnValue(false);

      await expect(controller.getTempFile('nonexistent.mp4')).rejects.toThrow(
        HttpException,
      );
    });

    it('should detect correct content type for image files', async () => {
      const fs = require('node:fs');
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(Buffer.from('test-content'));

      const result = await controller.getTempFile('test-image.jpg');

      expect(result.contentType).toBe('image/jpg');
    });
  });

  // ==========================================================================
  // cleanupTempFiles
  // ==========================================================================
  describe('cleanupTempFiles', () => {
    it('should cleanup temp files successfully', async () => {
      const result = await controller.cleanupTempFiles();

      expect(tempFileCleanupCron.manualCleanup).toHaveBeenCalled();
      expect(result.filesDeleted).toBe(5);
      expect(result.totalFiles).toBe(10);
    });

    it('should handle cleanup errors', async () => {
      mockTempFileCleanupCron.manualCleanup.mockRejectedValueOnce(
        new Error('Cleanup failed'),
      );

      await expect(controller.cleanupTempFiles()).rejects.toThrow(
        HttpException,
      );
    });
  });

  // ==========================================================================
  // uploadFile
  // ==========================================================================
  describe('uploadFile', () => {
    it('should upload file from path', async () => {
      const body = {
        key: 'test-file.mp4',
        source: { path: '/path/to/file.mp4', type: 'file' as const },
        type: 'video',
      };

      const result = await controller.uploadFile(body);

      expect(uploadService.uploadToS3).toHaveBeenCalledWith(
        'test-file.mp4',
        'video',
        { path: '/path/to/file.mp4', type: 'file' },
      );
      expect(result.publicUrl).toBeDefined();
    });

    it('should upload file from URL', async () => {
      const body = {
        key: 'test-file.mp4',
        source: { type: 'url' as const, url: 'https://example.com/video.mp4' },
        type: 'video',
      };

      const result = await controller.uploadFile(body);

      expect(uploadService.uploadToS3).toHaveBeenCalled();
      expect(result.publicUrl).toBeDefined();
    });

    it('should upload file from base64', async () => {
      const body = {
        key: 'test-file.mp4',
        source: {
          contentType: 'video/mp4',
          data: 'dGVzdC1kYXRh',
          type: 'base64' as const,
        },
        type: 'video',
      };

      const result = await controller.uploadFile(body);

      expect(uploadService.uploadToS3).toHaveBeenCalled();
      expect(result.publicUrl).toBeDefined();
    });

    it('should upload file from buffer (base64 encoded)', async () => {
      const body = {
        key: 'test-file.mp4',
        source: {
          contentType: 'video/mp4',
          data: 'dGVzdC1kYXRh', // base64 encoded
          type: 'buffer' as const,
        },
        type: 'video',
      };

      const result = await controller.uploadFile(body);

      expect(uploadService.uploadToS3).toHaveBeenCalledWith(
        'test-file.mp4',
        'video',
        expect.objectContaining({
          data: expect.any(Buffer),
          type: 'buffer',
        }),
      );
      expect(result.publicUrl).toBeDefined();
    });

    it('should throw error if required fields are missing', async () => {
      const body = { key: 'test.mp4' } as any;

      await expect(controller.uploadFile(body)).rejects.toThrow(HttpException);
      await expect(controller.uploadFile(body)).rejects.toThrow(
        'key, type, and source are required',
      );
    });

    it('should throw error for invalid URL', async () => {
      const body = {
        key: 'test-file.mp4',
        source: { type: 'url' as const, url: 'not-a-valid-url' },
        type: 'video',
      };

      await expect(controller.uploadFile(body)).rejects.toThrow(HttpException);
      await expect(controller.uploadFile(body)).rejects.toThrow('Invalid URL');
    });

    it('should throw error for empty URL in url source', async () => {
      const body = {
        key: 'test-file.mp4',
        source: { type: 'url' as const, url: '' },
        type: 'video',
      };

      await expect(controller.uploadFile(body)).rejects.toThrow(HttpException);
    });

    it('should handle upload errors', async () => {
      mockUploadService.uploadToS3.mockRejectedValueOnce(
        new Error('Upload failed'),
      );

      const body = {
        key: 'test-file.mp4',
        source: { path: '/path/to/file.mp4', type: 'file' as const },
        type: 'video',
      };

      await expect(controller.uploadFile(body)).rejects.toThrow(HttpException);
    });
  });

  // ==========================================================================
  // downloadFile
  // ==========================================================================
  describe('downloadFile', () => {
    it('should download file successfully', async () => {
      const mockRes = {
        set: vi.fn(),
      } as unknown as Response;

      const result = await controller.downloadFile(
        'video',
        'test.mp4',
        mockRes,
      );

      expect(s3Service.generateS3Key).toHaveBeenCalledWith('video', 'test.mp4');
      expect(s3Service.getFileStream).toHaveBeenCalled();
      expect(mockRes.set).toHaveBeenCalledWith(
        expect.objectContaining({
          'Content-Type': 'video/mp4',
        }),
      );
      expect(result).toBeInstanceOf(StreamableFile);
    });

    it('should handle non-string key parameter', async () => {
      const mockRes = {
        set: vi.fn(),
      } as unknown as Response;

      await controller.downloadFile('video', { path: 'test.mp4' }, mockRes);

      expect(s3Service.generateS3Key).toHaveBeenCalledWith(
        'video',
        '[object Object]',
      );
    });

    it('should handle S3 download errors', async () => {
      mockS3Service.getFileStream.mockRejectedValueOnce(new Error('S3 error'));

      const mockRes = {
        set: vi.fn(),
      } as unknown as Response;

      await expect(
        controller.downloadFile('video', 'test.mp4', mockRes),
      ).rejects.toThrow(HttpException);
    });
  });

  // ==========================================================================
  // copyFile
  // ==========================================================================
  describe('copyFile', () => {
    it('should copy file successfully', async () => {
      const body = {
        destinationKey: 'dest.mp4',
        destinationType: 'video',
        sourceKey: 'source.mp4',
        sourceType: 'video',
      };

      const result = await controller.copyFile(body);

      expect(s3Service.copyFile).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.publicUrl).toBeDefined();
    });

    it('should copy file without types (full S3 keys)', async () => {
      const body = {
        destinationKey: 'ingredients/video/dest.mp4',
        sourceKey: 'ingredients/video/source.mp4',
      };

      const result = await controller.copyFile(body);

      expect(s3Service.copyFile).toHaveBeenCalledWith(
        'ingredients/video/source.mp4',
        'ingredients/video/dest.mp4',
      );
      expect(result.success).toBe(true);
    });

    it('should throw error if sourceKey is missing', async () => {
      const body = { destinationKey: 'dest.mp4' } as any;

      await expect(controller.copyFile(body)).rejects.toThrow(HttpException);
      await expect(controller.copyFile(body)).rejects.toThrow(
        'sourceKey and destinationKey are required',
      );
    });

    it('should throw error if destinationKey is missing', async () => {
      const body = { sourceKey: 'source.mp4' } as any;

      await expect(controller.copyFile(body)).rejects.toThrow(HttpException);
    });

    it('should handle S3 copy errors', async () => {
      mockS3Service.copyFile.mockRejectedValueOnce(new Error('Copy failed'));

      const body = {
        destinationKey: 'dest.mp4',
        sourceKey: 'source.mp4',
      };

      await expect(controller.copyFile(body)).rejects.toThrow(HttpException);
    });
  });

  // ==========================================================================
  // getPresignedUploadUrl
  // ==========================================================================
  describe('getPresignedUploadUrl', () => {
    it('should return presigned upload URL', async () => {
      const body = {
        contentType: 'video/mp4',
        filename: 'test.mp4',
        type: 'video',
      };

      const result = await controller.getPresignedUploadUrl(body);

      expect(s3Service.generateS3Key).toHaveBeenCalledWith('video', 'test.mp4');
      expect(s3Service.getPresignedUploadUrl).toHaveBeenCalledWith(
        expect.any(String),
        'video/mp4',
        3600,
      );
      expect(result.uploadUrl).toBe('https://s3.presigned.upload.url');
      expect(result.publicUrl).toBe('https://s3.public.url');
      expect(result.expiresIn).toBe(3600);
    });

    it('should handle presigned URL errors', async () => {
      mockS3Service.getPresignedUploadUrl.mockRejectedValueOnce(
        new Error('Presigned URL error'),
      );

      const body = {
        contentType: 'video/mp4',
        filename: 'test.mp4',
        type: 'video',
      };

      await expect(controller.getPresignedUploadUrl(body)).rejects.toThrow(
        HttpException,
      );
    });
  });

  // ==========================================================================
  // getPresignedDownloadUrl
  // ==========================================================================
  describe('getPresignedDownloadUrl', () => {
    it('should return presigned download URL', async () => {
      const result = await controller.getPresignedDownloadUrl(
        'video',
        'test.mp4',
      );

      expect(s3Service.generateS3Key).toHaveBeenCalledWith('video', 'test.mp4');
      expect(s3Service.getPresignedDownloadUrl).toHaveBeenCalledWith(
        expect.any(String),
        3600,
      );
      expect(result.downloadUrl).toBe('https://s3.presigned.download.url');
      expect(result.expiresIn).toBe(3600);
    });

    it('should handle presigned download URL errors', async () => {
      mockS3Service.getPresignedDownloadUrl.mockRejectedValueOnce(
        new Error('Presigned URL error'),
      );

      await expect(
        controller.getPresignedDownloadUrl('video', 'test.mp4'),
      ).rejects.toThrow(HttpException);
    });
  });
});
