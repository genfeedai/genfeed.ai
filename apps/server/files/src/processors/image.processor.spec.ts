import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { ImageProcessor } from '@files/processors/image.processor';
import type { FilesPortraitBlurService } from '@files/services/files/blur/files-portrait-blur.service';
import type { FilesService } from '@files/services/files/files.service';
import type { FilesImageToVideoService } from '@files/services/files/image-to-video/files-image-to-video.service';
import type { FilesKenBurnsEffectService } from '@files/services/files/ken-burns/files-ken-burns-effect.service';
import type { FilesSplitScreenService } from '@files/services/files/split/files-split-screen.service';
import type { WebSocketService } from '@files/services/websocket/websocket.service';
import type { ImageJobData } from '@files/shared/interfaces/job.interface';
import type { LoggerService } from '@libs/logger/logger.service';
import type { Job } from 'bullmq';

vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn().mockResolvedValue(Buffer.from('source-image')),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

type MockJob = {
  data: ImageJobData;
  id: string;
  name: string;
};

const createJobData = (overrides?: Partial<ImageJobData>): ImageJobData => ({
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  id: 'image-job-1',
  ingredientId: 'ingredient-1',
  metadata: { websocketUrl: '/ws/images' },
  organizationId: 'org-1',
  params: {},
  type: 'resize-image',
  userId: 'user-1',
  ...overrides,
});

const createJob = (
  name: string,
  overrides?: Partial<ImageJobData>,
): MockJob => ({
  data: createJobData(overrides),
  id: 'job-1',
  name,
});

describe('ImageProcessor', () => {
  let processor: ImageProcessor;
  let webSocketService: {
    emitError: ReturnType<typeof vi.fn>;
    emitSuccess: ReturnType<typeof vi.fn>;
  };
  let filesImageToVideoService: {
    createVideoFromImages: ReturnType<typeof vi.fn>;
  };
  let filesKenBurnsEffectService: {
    applyKenBurnsEffect: ReturnType<typeof vi.fn>;
  };
  let filesSplitScreenService: {
    createSplitScreenVideo: ReturnType<typeof vi.fn>;
  };
  let filesPortraitBlurService: {
    applyPortraitBlur: ReturnType<typeof vi.fn>;
  };
  let filesService: {
    getPath: ReturnType<typeof vi.fn>;
    resizeImage: ReturnType<typeof vi.fn>;
  };
  let logger: {
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    webSocketService = {
      emitError: vi.fn().mockResolvedValue(undefined),
      emitSuccess: vi.fn().mockResolvedValue(undefined),
    };
    filesImageToVideoService = {
      createVideoFromImages: vi.fn().mockResolvedValue('/tmp/image-video.mp4'),
    };
    filesKenBurnsEffectService = {
      applyKenBurnsEffect: vi.fn().mockResolvedValue('/tmp/ken-burns.mp4'),
    };
    filesSplitScreenService = {
      createSplitScreenVideo: vi.fn().mockResolvedValue('/tmp/split.mp4'),
    };
    filesPortraitBlurService = {
      applyPortraitBlur: vi.fn().mockResolvedValue('/tmp/portrait.mp4'),
    };
    filesService = {
      getPath: vi.fn().mockReturnValue('/tmp/images/ingredient-1'),
      resizeImage: vi.fn().mockResolvedValue(Buffer.from('resized-image')),
    };
    logger = {
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    processor = new ImageProcessor(
      webSocketService as unknown as WebSocketService,
      filesImageToVideoService as unknown as FilesImageToVideoService,
      filesKenBurnsEffectService as unknown as FilesKenBurnsEffectService,
      filesSplitScreenService as unknown as FilesSplitScreenService,
      filesPortraitBlurService as unknown as FilesPortraitBlurService,
      filesService as unknown as FilesService,
      logger as unknown as LoggerService,
    );
  });

  it('routes image-to-video jobs to the files image-to-video service', async () => {
    const job = createJob('image-to-video', {
      params: {
        dimensions: { height: 1920, width: 1080 },
        images: ['frame-0.jpg'],
        isWatermarkEnabled: true,
        slideText: [{ duration: 3, voiceText: 'Hello' }],
      },
    });

    const result = await processor.handleImageToVideo(
      job as unknown as Job<ImageJobData>,
    );

    expect(filesImageToVideoService.createVideoFromImages).toHaveBeenCalledWith(
      ['frame-0.jpg'],
      expect.objectContaining({
        dimensions: { height: 1920, width: 1080 },
        isWatermarkEnabled: true,
        slideText: [{ duration: 3, voiceText: 'Hello' }],
      }),
      'ingredient-1',
    );
    expect(webSocketService.emitSuccess).toHaveBeenCalledWith(
      '/ws/images',
      expect.objectContaining({ outputPath: '/tmp/image-video.mp4' }),
      undefined,
      undefined,
    );
    expect(result).toEqual({
      outputPath: '/tmp/image-video.mp4',
      success: true,
    });
  });

  it('routes Ken Burns jobs to the files Ken Burns service', async () => {
    const job = createJob('ken-burns-effect', {
      params: {
        duration: 4,
        fontFamily: 'inter',
        inputPath: '/tmp/input.jpg',
        isClipSelected: true,
      },
    });

    const result = await processor.handleKenBurnsEffect(
      job as unknown as Job<ImageJobData>,
    );

    expect(filesKenBurnsEffectService.applyKenBurnsEffect).toHaveBeenCalledWith(
      '/tmp/input.jpg',
      4,
      'ingredient-1',
      expect.objectContaining({
        fontFamily: 'inter',
        isClipSelected: true,
      }),
    );
    expect(result).toEqual({
      outputPath: '/tmp/ken-burns.mp4',
      success: true,
    });
  });

  it('routes split-screen jobs to the files split-screen service', async () => {
    const job = createJob('split-screen', {
      params: {
        videos: ['top.mp4', 'bottom.mp4'],
      },
    });

    const result = await processor.handleSplitScreen(
      job as unknown as Job<ImageJobData>,
    );

    expect(filesSplitScreenService.createSplitScreenVideo).toHaveBeenCalledWith(
      ['top.mp4', 'bottom.mp4'],
      'ingredient-1',
      expect.objectContaining({
        bottomClip: 'bottom.mp4',
        topClip: 'top.mp4',
      }),
    );
    expect(result).toEqual({
      outputPath: '/tmp/split.mp4',
      success: true,
    });
  });

  it('routes portrait blur jobs to the files portrait blur service', async () => {
    const job = createJob('portrait-blur', {
      params: {
        inputPath: '/tmp/landscape.mp4',
        inputType: 'clips',
        videoFile: 'clip-0.mp4',
      },
    });

    const result = await processor.handlePortraitBlur(
      job as unknown as Job<ImageJobData>,
    );

    expect(filesPortraitBlurService.applyPortraitBlur).toHaveBeenCalledWith(
      '/tmp/landscape.mp4',
      'ingredient-1',
      expect.objectContaining({
        inputType: 'clips',
        videoFile: 'clip-0.mp4',
      }),
    );
    expect(result).toEqual({
      outputPath: '/tmp/portrait.mp4',
      success: true,
    });
  });

  it('resizes image jobs and writes the output file', async () => {
    const job = createJob('resize-image', {
      params: {
        height: 600,
        inputPath: '/tmp/source.jpg',
        width: 800,
      },
    });

    const result = await processor.handleResizeImage(
      job as unknown as Job<ImageJobData>,
    );

    expect(readFile).toHaveBeenCalledWith('/tmp/source.jpg');
    expect(filesService.resizeImage).toHaveBeenCalledWith(
      Buffer.from('source-image'),
      { height: 600, width: 800 },
    );
    expect(mkdir).toHaveBeenCalledWith('/tmp/images/ingredient-1', {
      recursive: true,
    });
    expect(writeFile).toHaveBeenCalledWith(
      '/tmp/images/ingredient-1/job-1-resized.jpg',
      Buffer.from('resized-image'),
    );
    expect(result).toEqual({
      height: 600,
      outputPath: '/tmp/images/ingredient-1/job-1-resized.jpg',
      size: Buffer.from('resized-image').length,
      success: true,
      width: 800,
    });
  });

  it('returns a structured error when resize inputPath is missing', async () => {
    const job = createJob('resize-image', {
      params: {
        height: 600,
        width: 800,
      },
    });

    const result = await processor.handleResizeImage(
      job as unknown as Job<ImageJobData>,
    );

    expect(result).toEqual({
      error: 'inputPath is required',
      success: false,
    });
    expect(readFile).not.toHaveBeenCalled();
    expect(webSocketService.emitError).toHaveBeenCalledWith(
      '/ws/images',
      'inputPath is required',
      undefined,
      undefined,
    );
  });
});
