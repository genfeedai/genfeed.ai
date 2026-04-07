import { ConfigService } from '@api/config/config.service';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import type {
  ICaptionConfig,
  IImageInput,
  IKenBurnsOptions,
  IPortraitBlurOptions,
  ISplitScreenOptions,
  ISplitScreenVideo,
} from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Test, TestingModule } from '@nestjs/testing';
import type { AxiosResponse } from 'axios';
import { of, throwError } from 'rxjs';

const httpResponse = <T>(data: T) => of({ data } as AxiosResponse<T>);

describe('FilesClientService', () => {
  let service: FilesClientService;
  let httpService: vi.Mocked<HttpService>;
  let loggerService: vi.Mocked<LoggerService>;

  const mockFilesServiceUrl = 'http://localhost:3012';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FilesClientService,
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
        {
          provide: LoggerService,
          useValue: {
            debug: vi.fn(),
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<FilesClientService>(FilesClientService);
    httpService = module.get(HttpService);
    loggerService = module.get(LoggerService);

    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateCaptions', () => {
    it('should generate captions successfully', async () => {
      const videoUrl = 'https://example.com/video.mp4';
      const captions = { text: 'Hello world' } as unknown as ICaptionConfig;
      const ingredientId = '507f1f77bcf86cd799439011';
      const mockResponse = {
        data: {
          captionUrl: 'https://example.com/captions.vtt',
          success: true,
        },
      };

      httpService.post.mockReturnValue(httpResponse(mockResponse.data));

      const result = await service.generateCaptions(
        videoUrl,
        captions,
        ingredientId,
      );

      expect(result).toEqual(mockResponse.data);
      expect(httpService.post).toHaveBeenCalledWith(
        `${mockFilesServiceUrl}/v1/files/processing/captions`,
        {
          captions,
          ingredientId,
          videoUrl,
        },
      );
    });

    it('should handle errors when generating captions', async () => {
      const videoUrl = 'https://example.com/video.mp4';
      const captions = { text: 'Hello world' } as unknown as ICaptionConfig;
      const ingredientId = '507f1f77bcf86cd799439011';
      const error = new Error('Network error');

      httpService.post.mockReturnValue(throwError(() => error));

      await expect(
        service.generateCaptions(videoUrl, captions, ingredientId),
      ).rejects.toThrow(error);
      expect(loggerService.error).toHaveBeenCalledWith(
        'Failed to generate captions',
        error,
      );
    });
  });

  describe('createGif', () => {
    it('should create GIF successfully', async () => {
      const videoUrl = 'https://example.com/video.mp4';
      const outputPath = '/tmp/output.gif';
      const options = { fps: 10 };
      const mockResponse = {
        data: { gifUrl: 'https://example.com/output.gif', success: true },
      };

      httpService.post.mockReturnValue(httpResponse(mockResponse.data));

      const result = await service.createGif(videoUrl, outputPath, options);

      expect(result).toEqual(mockResponse.data);
      expect(httpService.post).toHaveBeenCalledWith(
        `${mockFilesServiceUrl}/v1/files/processing/gif`,
        { options, outputPath, videoUrl },
      );
    });

    it('should handle errors when creating GIF', async () => {
      const videoUrl = 'https://example.com/video.mp4';
      const outputPath = '/tmp/output.gif';
      const error = new Error('Processing error');

      httpService.post.mockReturnValue(throwError(() => error));

      await expect(service.createGif(videoUrl, outputPath)).rejects.toThrow(
        error,
      );
      expect(loggerService.error).toHaveBeenCalledWith(
        'Failed to create GIF',
        error,
      );
    });
  });

  describe('createVideoFromImages', () => {
    it('should create video from images successfully', async () => {
      const images = ['img1.jpg', 'img2.jpg'] as unknown as IImageInput[];
      const config = { duration: 5, fps: 30 };
      const ingredientId = '507f1f77bcf86cd799439011';
      const mockResponse = {
        data: { success: true, videoUrl: 'https://example.com/video.mp4' },
      };

      httpService.post.mockReturnValue(httpResponse(mockResponse.data));

      const result = await service.createVideoFromImages(
        images,
        config,
        ingredientId,
      );

      expect(result).toEqual(mockResponse.data);
      expect(httpService.post).toHaveBeenCalledWith(
        `${mockFilesServiceUrl}/v1/files/processing/image-to-video`,
        { config, images, ingredientId },
      );
    });

    it('should handle errors when creating video from images', async () => {
      const images = ['img1.jpg'] as unknown as IImageInput[];
      const config = {};
      const ingredientId = '507f1f77bcf86cd799439011';
      const error = new Error('Processing error');

      httpService.post.mockReturnValue(throwError(() => error));

      await expect(
        service.createVideoFromImages(images, config, ingredientId),
      ).rejects.toThrow(error);
      expect(loggerService.error).toHaveBeenCalledWith(
        'Failed to create video from images',
        error,
      );
    });
  });

  describe('applyKenBurnsEffect', () => {
    it('should apply Ken Burns effect successfully', async () => {
      const imageUrl = 'https://example.com/image.jpg';
      const duration = 5;
      const ingredientId = '507f1f77bcf86cd799439011';
      const options = { zoom: 1.2 } as unknown as IKenBurnsOptions;
      const mockResponse = {
        data: { success: true, videoUrl: 'https://example.com/ken-burns.mp4' },
      };

      httpService.post.mockReturnValue(httpResponse(mockResponse.data));

      const result = await service.applyKenBurnsEffect(
        imageUrl,
        duration,
        ingredientId,
        options,
      );

      expect(result).toEqual(mockResponse.data);
      expect(httpService.post).toHaveBeenCalledWith(
        `${mockFilesServiceUrl}/v1/files/processing/ken-burns`,
        { duration, imageUrl, ingredientId, options },
      );
    });

    it('should handle errors when applying Ken Burns effect', async () => {
      const imageUrl = 'https://example.com/image.jpg';
      const duration = 5;
      const ingredientId = '507f1f77bcf86cd799439011';
      const error = new Error('Processing error');

      httpService.post.mockReturnValue(throwError(() => error));

      await expect(
        service.applyKenBurnsEffect(imageUrl, duration, ingredientId),
      ).rejects.toThrow(error);
      expect(loggerService.error).toHaveBeenCalledWith(
        'Failed to apply Ken Burns effect',
        error,
      );
    });
  });

  describe('applyPortraitBlur', () => {
    it('should apply portrait blur successfully', async () => {
      const videoUrl = 'https://example.com/video.mp4';
      const ingredientId = '507f1f77bcf86cd799439011';
      const options = { blurIntensity: 10 } as unknown as IPortraitBlurOptions;
      const mockResponse = {
        data: { success: true, videoUrl: 'https://example.com/blurred.mp4' },
      };

      httpService.post.mockReturnValue(httpResponse(mockResponse.data));

      const result = await service.applyPortraitBlur(
        videoUrl,
        ingredientId,
        options,
      );

      expect(result).toEqual(mockResponse.data);
      expect(httpService.post).toHaveBeenCalledWith(
        `${mockFilesServiceUrl}/v1/files/processing/portrait-blur`,
        { ingredientId, options, videoUrl },
      );
    });

    it('should handle errors when applying portrait blur', async () => {
      const videoUrl = 'https://example.com/video.mp4';
      const ingredientId = '507f1f77bcf86cd799439011';
      const error = new Error('Processing error');

      httpService.post.mockReturnValue(throwError(() => error));

      await expect(
        service.applyPortraitBlur(videoUrl, ingredientId),
      ).rejects.toThrow(error);
      expect(loggerService.error).toHaveBeenCalledWith(
        'Failed to apply portrait blur',
        error,
      );
    });
  });

  describe('createSplitScreenVideo', () => {
    it('should create split screen video successfully', async () => {
      const videos = [
        'video1.mp4',
        'video2.mp4',
      ] as unknown as ISplitScreenVideo[];
      const ingredientId = '507f1f77bcf86cd799439011';
      const options = {
        layout: 'side-by-side',
      } as unknown as ISplitScreenOptions;
      const mockResponse = {
        data: { success: true, videoUrl: 'https://example.com/split.mp4' },
      };

      httpService.post.mockReturnValue(httpResponse(mockResponse.data));

      const result = await service.createSplitScreenVideo(
        videos,
        ingredientId,
        options,
      );

      expect(result).toEqual(mockResponse.data);
      expect(httpService.post).toHaveBeenCalledWith(
        `${mockFilesServiceUrl}/v1/files/processing/split-screen`,
        { ingredientId, options, videos },
      );
    });

    it('should handle errors when creating split screen video', async () => {
      const videos = ['video1.mp4'] as unknown as ISplitScreenVideo[];
      const ingredientId = '507f1f77bcf86cd799439011';
      const error = new Error('Processing error');

      httpService.post.mockReturnValue(throwError(() => error));

      await expect(
        service.createSplitScreenVideo(videos, ingredientId),
      ).rejects.toThrow(error);
      expect(loggerService.error).toHaveBeenCalledWith(
        'Failed to create split screen video',
        error,
      );
    });
  });

  describe('resizeImage', () => {
    it('should resize image successfully', async () => {
      const imageData = Buffer.from('test-image-data');
      const target = { height: 600, width: 800 };
      const mockResponse = {
        data: { data: Buffer.from('resized-image').toString('base64') },
      };

      httpService.post.mockReturnValue(httpResponse(mockResponse.data));

      const result = await service.resizeImage(imageData, target);

      expect(result).toBeInstanceOf(Buffer);
      expect(httpService.post).toHaveBeenCalledWith(
        `${mockFilesServiceUrl}/v1/files/processing/resize-image`,
        {
          height: target.height,
          imageData: imageData.toString('base64'),
          width: target.width,
        },
      );
    });

    it('should handle errors when resizing image', async () => {
      const imageData = Buffer.from('test-image-data');
      const target = { height: 600, width: 800 };
      const error = new Error('Processing error');

      httpService.post.mockReturnValue(throwError(() => error));

      await expect(service.resizeImage(imageData, target)).rejects.toThrow(
        error,
      );
      expect(loggerService.error).toHaveBeenCalledWith(
        'Failed to resize image',
        error,
      );
    });
  });

  describe('resizeVideo', () => {
    it('should resize video successfully', async () => {
      const inputPath = '/tmp/input.mp4';
      const target = { height: 1080, width: 1920 };
      const mockResponse = {
        data: { success: true, videoUrl: 'https://example.com/resized.mp4' },
      };

      httpService.post.mockReturnValue(httpResponse(mockResponse.data));

      const result = await service.resizeVideo(inputPath, target);

      expect(result).toEqual(mockResponse.data);
      expect(httpService.post).toHaveBeenCalledWith(
        `${mockFilesServiceUrl}/v1/files/processing/resize-video`,
        { height: target.height, inputPath, width: target.width },
      );
    });

    it('should handle errors when resizing video', async () => {
      const inputPath = '/tmp/input.mp4';
      const target = { height: 1080, width: 1920 };
      const error = new Error('Processing error');

      httpService.post.mockReturnValue(throwError(() => error));

      await expect(service.resizeVideo(inputPath, target)).rejects.toThrow(
        error,
      );
      expect(loggerService.error).toHaveBeenCalledWith(
        'Failed to resize video',
        error,
      );
    });
  });

  describe('downloadFile', () => {
    it('should download file successfully', async () => {
      const url = 'https://example.com/file.mp4';
      const outputPath = '/tmp/downloaded.mp4';
      const headers = { Authorization: 'Bearer token' };
      const mockResponse = { data: { path: outputPath, success: true } };

      httpService.post.mockReturnValue(httpResponse(mockResponse.data));

      const result = await service.downloadFile(url, outputPath, headers);

      expect(result).toEqual(mockResponse.data);
      expect(httpService.post).toHaveBeenCalledWith(
        `${mockFilesServiceUrl}/v1/files/processing/download-file`,
        { headers, outputPath, url },
      );
    });

    it('should handle errors when downloading file', async () => {
      const url = 'https://example.com/file.mp4';
      const outputPath = '/tmp/downloaded.mp4';
      const error = new Error('Download error');

      httpService.post.mockReturnValue(throwError(() => error));

      await expect(service.downloadFile(url, outputPath)).rejects.toThrow(
        error,
      );
      expect(loggerService.error).toHaveBeenCalledWith(
        'Failed to download file',
        error,
      );
    });
  });

  describe('getVideoMetadata', () => {
    it('should get video metadata successfully', async () => {
      const videoPath = '/tmp/video.mp4';
      const mockResponse = {
        data: {
          duration: 10.5,
          fps: 30,
          height: 1080,
          width: 1920,
        },
      };

      httpService.post.mockReturnValue(httpResponse(mockResponse.data));

      const result = await service.getVideoMetadata(videoPath);

      expect(result).toEqual(mockResponse.data);
      expect(httpService.post).toHaveBeenCalledWith(
        `${mockFilesServiceUrl}/v1/files/processing/get-video-metadata`,
        { videoPath },
      );
    });

    it('should handle errors when getting video metadata', async () => {
      const videoPath = '/tmp/video.mp4';
      const error = new Error('Metadata error');

      httpService.post.mockReturnValue(throwError(() => error));

      await expect(service.getVideoMetadata(videoPath)).rejects.toThrow(error);
      expect(loggerService.error).toHaveBeenCalledWith(
        'Failed to get video metadata',
        error,
      );
    });
  });

  describe('extractFrames', () => {
    it('should extract frames successfully', async () => {
      const videoPath = '/tmp/video.mp4';
      const outputDir = '/tmp/frames';
      const fps = 1;
      const mockResponse = { data: { frames: 10, success: true } };

      httpService.post.mockReturnValue(httpResponse(mockResponse.data));

      const result = await service.extractFrames(videoPath, outputDir, fps);

      expect(result).toEqual(mockResponse.data);
      expect(httpService.post).toHaveBeenCalledWith(
        `${mockFilesServiceUrl}/v1/files/processing/extract-frames`,
        { fps, outputDir, videoPath },
      );
    });

    it('should handle errors when extracting frames', async () => {
      const videoPath = '/tmp/video.mp4';
      const outputDir = '/tmp/frames';
      const error = new Error('Extraction error');

      httpService.post.mockReturnValue(throwError(() => error));

      await expect(service.extractFrames(videoPath, outputDir)).rejects.toThrow(
        error,
      );
      expect(loggerService.error).toHaveBeenCalledWith(
        'Failed to extract frames',
        error,
      );
    });
  });

  describe('mergeVideos', () => {
    it('should merge videos successfully', async () => {
      const videoPaths = ['/tmp/video1.mp4', '/tmp/video2.mp4'];
      const outputPath = '/tmp/merged.mp4';
      const transition = 'fade';
      const mockResponse = {
        data: { success: true, videoUrl: 'https://example.com/merged.mp4' },
      };

      httpService.post.mockReturnValue(httpResponse(mockResponse.data));

      const result = await service.mergeVideos(
        videoPaths,
        outputPath,
        transition,
      );

      expect(result).toEqual(mockResponse.data);
      expect(httpService.post).toHaveBeenCalledWith(
        `${mockFilesServiceUrl}/v1/files/processing/merge-videos`,
        { outputPath, transition, videoPaths },
      );
    });

    it('should handle errors when merging videos', async () => {
      const videoPaths = ['/tmp/video1.mp4', '/tmp/video2.mp4'];
      const outputPath = '/tmp/merged.mp4';
      const error = new Error('Merge error');

      httpService.post.mockReturnValue(throwError(() => error));

      await expect(service.mergeVideos(videoPaths, outputPath)).rejects.toThrow(
        error,
      );
      expect(loggerService.error).toHaveBeenCalledWith(
        'Failed to merge videos',
        error,
      );
    });
  });

  describe('getPath', () => {
    it('should return correct path for given type and ingredientId', () => {
      const type = 'videos';
      const ingredientId = '507f1f77bcf86cd799439011';

      const result = service.getPath(type, ingredientId);

      expect(result).toContain('public');
      expect(result).toContain('tmp');
      expect(result).toContain(type);
      expect(result).toContain(ingredientId);
    });
  });
});
