import path from 'node:path';
import { ConfigService } from '@files/config/config.service';
import { FilesService } from '@files/services/files/files.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Test, TestingModule } from '@nestjs/testing';
import { of, throwError } from 'rxjs';
import sharp from 'sharp';
import type { Mock, Mocked } from 'vitest';

vi.mock('fs');
vi.mock('sharp');
vi.mock('axios');

const childProcessMock = vi.hoisted(() => ({
  execFile: vi.fn(),
  spawn: vi.fn(),
}));
vi.mock('node:child_process', () => childProcessMock);

import { execFile, spawn } from 'node:child_process';
import * as fs from 'node:fs';

/** Sets up `spawn` so the real (non-mocked) `runFfmpeg` resolves successfully. */
function mockSuccessfulFfmpegProcess() {
  (spawn as Mock).mockReturnValue({
    on: vi.fn((event: string, callback: (code: number) => void) => {
      if (event === 'close') {
        callback(0);
      }
    }),
  });
}

/** Sets up `spawn` so the real `runFfmpeg` rejects with a non-zero exit code. */
function mockFailingFfmpegProcess(code = 1) {
  (spawn as Mock).mockReturnValue({
    on: vi.fn((event: string, callback: (code: number) => void) => {
      if (event === 'close') {
        callback(code);
      }
    }),
  });
}

describe('FilesService', () => {
  let service: FilesService;
  let loggerService: Mocked<LoggerService>;
  let httpService: { get: Mock };

  const mockBuffer = Buffer.from('test');
  const mockIngredientId = 'test-ingredient-123';

  beforeEach(async () => {
    httpService = { get: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FilesService,
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn(),
            ingredientsEndpoint: 'https://api.example.com/ingredients',
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
        {
          provide: HttpService,
          useValue: httpService,
        },
      ],
    }).compile();

    service = module.get<FilesService>(FilesService);
    loggerService = module.get(LoggerService);

    vi.clearAllMocks();
    (fs.existsSync as Mock).mockReturnValue(true);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getPath', () => {
    it('should create directory if it does not exist', () => {
      const type = 'images';
      const expectedPath = path.resolve(
        'public',
        'tmp',
        type,
        mockIngredientId,
      );

      (fs.existsSync as Mock).mockReturnValue(false);
      (fs.mkdirSync as Mock).mockImplementation(() => {
        /* noop */
      });

      const result = service.getPath(type, mockIngredientId);

      expect(fs.existsSync).toHaveBeenCalledWith(expectedPath);
      expect(fs.mkdirSync).toHaveBeenCalledWith(expectedPath, {
        recursive: true,
      });
      expect(result).toBe(expectedPath);
    });

    it('should return existing path without creating directory', () => {
      const type = 'videos';
      const expectedPath = path.resolve(
        'public',
        'tmp',
        type,
        mockIngredientId,
      );

      (fs.existsSync as Mock).mockReturnValue(true);

      const result = service.getPath(type, mockIngredientId);

      expect(fs.existsSync).toHaveBeenCalledWith(expectedPath);
      expect(fs.mkdirSync).not.toHaveBeenCalled();
      expect(result).toBe(expectedPath);
    });
  });

  describe('resizeImage', () => {
    it('should resize image with correct dimensions', async () => {
      const target = { height: 600, width: 800 };
      const mockResizedBuffer = Buffer.from('resized');

      const mockSharpInstance = {
        resize: vi.fn().mockReturnThis(),
        rotate: vi.fn().mockReturnThis(),
        toBuffer: vi.fn().mockResolvedValue(mockResizedBuffer),
      };

      (sharp as unknown as Mock).mockReturnValue(mockSharpInstance);

      const result = await service.resizeImage(mockBuffer, target);

      expect(sharp).toHaveBeenCalledWith(mockBuffer);
      expect(mockSharpInstance.resize).toHaveBeenCalledWith(
        target.width,
        target.height,
        { fit: 'cover' },
      );
      expect(mockSharpInstance.toBuffer).toHaveBeenCalled();
      expect(result).toBe(mockResizedBuffer);
    });

    it('should handle resize errors', async () => {
      const target = { height: 600, width: 800 };
      const mockError = new Error('Resize failed');

      const mockSharpInstance = {
        resize: vi.fn().mockReturnThis(),
        rotate: vi.fn().mockReturnThis(),
        toBuffer: vi.fn().mockRejectedValue(mockError),
      };

      (sharp as unknown as Mock).mockReturnValue(mockSharpInstance);

      await expect(service.resizeImage(mockBuffer, target)).rejects.toThrow(
        'Resize failed',
      );
    });
  });

  describe('resizeVideo', () => {
    it('should resize video with correct dimensions', async () => {
      const inputPath = '/tmp/video.mp4';
      const target = { height: 720, width: 1280 };
      const expectedOutputPath = path.resolve(
        'public',
        'tmp',
        'video_resized.mp4',
      );

      mockSuccessfulFfmpegProcess();

      const result = await service.resizeVideo(inputPath, target);

      expect(spawn).toHaveBeenCalled();
      expect(result).toBe(expectedOutputPath);
    });

    it('should handle resize errors', async () => {
      const inputPath = '/tmp/video.mp4';
      const target = { height: 720, width: 1280 };

      mockFailingFfmpegProcess(1);

      await expect(service.resizeVideo(inputPath, target)).rejects.toThrow(
        'ffmpeg exited with code 1',
      );
    });
  });

  describe('prepareAllFiles', () => {
    it('downloads images, voices, and background music from frames', async () => {
      httpService.get.mockReturnValue(of({ data: Buffer.from('binary-data') }));
      (sharp as unknown as Mock).mockReturnValue({
        jpeg: vi.fn().mockReturnThis(),
        resize: vi.fn().mockReturnThis(),
        rotate: vi.fn().mockReturnThis(),
        toFile: vi.fn().mockResolvedValue(undefined),
      });

      const frames = [
        {
          duration: 3,
          image: 'img-1',
          overlayText: 'hi',
          voice: 'voice-1',
          voiceText: 'hello there',
        },
      ];

      const result = await service.prepareAllFiles(
        mockIngredientId,
        frames,
        'music-1',
      );

      expect(result.images).toEqual(['img-1']);
      expect(result.voices).toEqual(['voice-1']);
      expect(result.captions).toEqual([
        { duration: 3, overlayText: 'hi', voiceText: 'hello there' },
      ]);
      expect(httpService.get).toHaveBeenCalled();
    });

    it('downloads image-to-videos instead of images when present', async () => {
      httpService.get.mockReturnValue(of({ data: Buffer.from('binary-data') }));

      const frames = [{ duration: 3, imageToVideo: 'clip-1', voiceText: 'hi' }];

      const result = await service.prepareAllFiles(
        mockIngredientId,
        frames,
        '',
      );

      expect(result.imageToVideos).toEqual(['clip-1']);
      expect(result.images).toEqual([]);
    });
  });

  describe('downloadFile', () => {
    it('writes non-image files with fs.writeFileSync', async () => {
      httpService.get.mockReturnValue(of({ data: Buffer.from('binary-data') }));

      const filePath = await service.downloadFile(
        mockIngredientId,
        'voices',
        'voice-1',
        0,
      );

      expect(fs.writeFileSync).toHaveBeenCalled();
      expect(filePath).toContain('frame-0.mp3');
    });

    it('processes image files through sharp instead of writeFileSync', async () => {
      httpService.get.mockReturnValue(of({ data: Buffer.from('binary-data') }));
      const toFile = vi.fn().mockResolvedValue(undefined);
      (sharp as unknown as Mock).mockReturnValue({
        jpeg: vi.fn().mockReturnThis(),
        resize: vi.fn().mockReturnThis(),
        rotate: vi.fn().mockReturnThis(),
        toFile,
      });

      const filePath = await service.downloadFile(
        mockIngredientId,
        'images',
        'img-1',
        0,
      );

      expect(toFile).toHaveBeenCalled();
      expect(fs.writeFileSync).not.toHaveBeenCalled();
      expect(filePath).toContain('frame-0.jpeg');
    });

    it('logs and wraps errors when the download fails', async () => {
      httpService.get.mockReturnValue(
        throwError(() => new Error('network down')),
      );

      await expect(
        service.downloadFile(mockIngredientId, 'voices', 'voice-1', 0),
      ).rejects.toThrow('Failed to download file: network down');
      expect(loggerService.error).toHaveBeenCalled();
    });
  });

  describe('addWatermark', () => {
    it('runs ffmpeg with a drawtext filter and returns the output path', async () => {
      mockSuccessfulFfmpegProcess();

      const result = await service.addWatermark('/tmp/output/video.mp4', {
        height: 1080,
        width: 1920,
      });

      expect(spawn).toHaveBeenCalled();
      expect(result).toBe('/tmp/output/video_watermark.mp4');
    });

    it('uses a custom watermark text when provided', async () => {
      mockSuccessfulFfmpegProcess();

      await service.addWatermark(
        '/tmp/output/video.mp4',
        { height: 1080, width: 1920 },
        'MyBrand',
      );

      const args = (spawn as Mock).mock.calls[0][1] as string[];
      expect(args.join(' ')).toContain('MyBrand');
    });
  });

  describe('addTextOverlay', () => {
    it('downloads the source video and adds a text overlay using provided dimensions', async () => {
      httpService.get.mockReturnValue(of({ data: Buffer.from('video-data') }));
      mockSuccessfulFfmpegProcess();

      const result = await service.addTextOverlay(
        mockIngredientId,
        'https://example.com/source.mp4',
        'Hello world',
        'bottom',
        { height: 1920, width: 1080 },
      );

      expect(fs.writeFileSync).toHaveBeenCalled();
      expect(result).toContain('text_overlay.mp4');
      expect(execFile).not.toHaveBeenCalled();
    });

    it('cleans up the downloaded input file when deletion is enabled', async () => {
      httpService.get.mockReturnValue(of({ data: Buffer.from('video-data') }));
      mockSuccessfulFfmpegProcess();

      await service.addTextOverlay(
        mockIngredientId,
        'https://example.com/source.mp4',
        'Hello world',
        'top',
        { height: 1920, width: 1080 },
      );

      expect(fs.unlinkSync).toHaveBeenCalled();
    });

    it('rethrows and logs when ffmpeg fails', async () => {
      httpService.get.mockReturnValue(of({ data: Buffer.from('video-data') }));
      mockFailingFfmpegProcess(1);

      await expect(
        service.addTextOverlay(
          mockIngredientId,
          'https://example.com/source.mp4',
          'Hello world',
          'center',
          { height: 1920, width: 1080 },
        ),
      ).rejects.toThrow('ffmpeg exited with code 1');
      expect(loggerService.error).toHaveBeenCalled();
    });
  });

  describe('reverseVideo', () => {
    it('downloads the source video and reverses it', async () => {
      httpService.get.mockReturnValue(of({ data: Buffer.from('video-data') }));
      mockSuccessfulFfmpegProcess();

      const result = await service.reverseVideo(
        mockIngredientId,
        'https://example.com/source.mp4',
      );

      expect(result).toContain('reversed.mp4');
    });

    it('rethrows and logs when ffmpeg fails', async () => {
      httpService.get.mockReturnValue(of({ data: Buffer.from('video-data') }));
      mockFailingFfmpegProcess(1);

      await expect(
        service.reverseVideo(
          mockIngredientId,
          'https://example.com/source.mp4',
        ),
      ).rejects.toThrow('ffmpeg exited with code 1');
      expect(loggerService.error).toHaveBeenCalled();
    });
  });

  describe('mirrorVideo', () => {
    it('downloads the source video and mirrors it', async () => {
      httpService.get.mockReturnValue(of({ data: Buffer.from('video-data') }));
      mockSuccessfulFfmpegProcess();

      const result = await service.mirrorVideo(
        mockIngredientId,
        'https://example.com/source.mp4',
      );

      expect(result).toContain('mirrored.mp4');
    });

    it('rethrows and logs when ffmpeg fails', async () => {
      httpService.get.mockReturnValue(of({ data: Buffer.from('video-data') }));
      mockFailingFfmpegProcess(1);

      await expect(
        service.mirrorVideo(mockIngredientId, 'https://example.com/source.mp4'),
      ).rejects.toThrow('ffmpeg exited with code 1');
    });
  });

  describe('convertToPortrait', () => {
    it('crops and scales the video to portrait dimensions', async () => {
      mockSuccessfulFfmpegProcess();

      const result = await service.convertToPortrait(
        'videos',
        mockIngredientId,
        'source.mp4',
      );

      expect(result).toContain('portrait.mp4');
    });

    it('accepts custom dimensions', async () => {
      mockSuccessfulFfmpegProcess();

      await service.convertToPortrait(
        'videos',
        mockIngredientId,
        'source.mp4',
        {
          height: 1280,
          width: 720,
        },
      );

      const args = (spawn as Mock).mock.calls[0][1] as string[];
      expect(args.join(' ')).toContain('scale=720:1280');
    });
  });

  describe('extractFirstAndLastFrames', () => {
    it('extracts the first and last frame paths', async () => {
      mockSuccessfulFfmpegProcess();

      const result = await service.extractFirstAndLastFrames(
        mockIngredientId,
        'source.mp4',
      );

      expect(result.first).toContain('first.jpg');
      expect(result.last).toContain('last.jpg');
      expect(spawn).toHaveBeenCalledTimes(2);
    });
  });

  describe('getVideoMetadata', () => {
    it('parses ffprobe JSON output', async () => {
      (execFile as unknown as Mock).mockImplementation(
        (
          _cmd: string,
          _args: string[],
          callback: (error: Error | null, result: unknown) => void,
        ) => {
          callback(null, {
            stderr: '',
            stdout: JSON.stringify({ format: { duration: '10' } }),
          });
        },
      );

      const result = await service.getVideoMetadata('/tmp/video.mp4');

      expect(result).toEqual({ format: { duration: '10' } });
    });

    it('logs and rethrows when ffprobe fails', async () => {
      (execFile as unknown as Mock).mockImplementation(
        (
          _cmd: string,
          _args: string[],
          callback: (error: Error | null, result: unknown) => void,
        ) => {
          callback(new Error('ffprobe not found'), undefined);
        },
      );

      await expect(service.getVideoMetadata('/tmp/video.mp4')).rejects.toThrow(
        'ffprobe not found',
      );
      expect(loggerService.error).toHaveBeenCalled();
    });
  });

  describe('extractFrames', () => {
    it('creates the output directory when missing and returns sorted frame paths', async () => {
      (fs.existsSync as Mock).mockReturnValue(false);
      mockSuccessfulFfmpegProcess();
      (fs.readdirSync as Mock).mockReturnValue([
        'frame-0002.jpg',
        'frame-0001.jpg',
        'other.txt',
      ]);

      const result = await service.extractFrames(
        '/tmp/video.mp4',
        '/tmp/frames',
      );

      expect(fs.mkdirSync).toHaveBeenCalledWith('/tmp/frames', {
        recursive: true,
      });
      expect(result).toEqual([
        path.join('/tmp/frames', 'frame-0001.jpg'),
        path.join('/tmp/frames', 'frame-0002.jpg'),
      ]);
    });
  });

  describe('mergeVideos', () => {
    it('writes a concat list file and merges the videos', async () => {
      mockSuccessfulFfmpegProcess();

      const result = await service.mergeVideos(
        ['/tmp/a.mp4', '/tmp/b.mp4'],
        '/tmp/output/merged.mp4',
      );

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('list.txt'),
        expect.stringContaining("file '/tmp/a.mp4'"),
      );
      expect(fs.unlinkSync).toHaveBeenCalled();
      expect(result).toBe('/tmp/output/merged.mp4');
    });

    it('cleans up the list file and rethrows when ffmpeg fails', async () => {
      mockFailingFfmpegProcess(1);

      await expect(
        service.mergeVideos(['/tmp/a.mp4'], '/tmp/output/merged.mp4'),
      ).rejects.toThrow('ffmpeg exited with code 1');
      expect(fs.unlinkSync).toHaveBeenCalled();
    });
  });

  describe('getSortedFiles', () => {
    it('should return sorted files by number', () => {
      const imagesPath = '/tmp/images';
      const extension = 'png';
      const mockFiles = ['image10.png', 'image2.png', 'image1.png', 'test.txt'];

      (fs.readdirSync as Mock).mockReturnValue(mockFiles);

      const result = service.getSortedFiles(imagesPath, extension);

      expect(fs.readdirSync).toHaveBeenCalledWith(imagesPath);
      expect(result).toEqual(['image1.png', 'image2.png', 'image10.png']);
    });

    it('should handle empty directory', () => {
      const imagesPath = '/tmp/images';
      const extension = 'png';

      (fs.readdirSync as Mock).mockReturnValue([]);

      const result = service.getSortedFiles(imagesPath, extension);

      expect(result).toEqual([]);
    });

    it('should handle files without numbers', () => {
      const imagesPath = '/tmp/images';
      const extension = 'png';
      const mockFiles = ['a.png', 'b.png', 'c.png'];

      (fs.readdirSync as Mock).mockReturnValue(mockFiles);

      const result = service.getSortedFiles(imagesPath, extension);

      expect(result).toEqual(['a.png', 'b.png', 'c.png']);
    });
  });

  describe('cleanupTempFiles', () => {
    it('should cleanup temp files when enabled', () => {
      const tempDirs = [
        'clips',
        'image-to-videos',
        'images',
        'musics',
        'slides',
        'voices',
      ];

      (fs.existsSync as Mock).mockReturnValue(true);
      (fs.rmSync as Mock).mockImplementation(() => {
        /* noop */
      });

      service.cleanupTempFiles(mockIngredientId, false);

      tempDirs.forEach((dir) => {
        const dirPath = path.resolve('public', 'tmp', dir, mockIngredientId);
        expect(fs.existsSync).toHaveBeenCalledWith(dirPath);
        expect(fs.rmSync).toHaveBeenCalledWith(dirPath, {
          force: true,
          recursive: true,
        });
      });
    });

    it('also cleans up the output directory when isDeleteOutputEnabled is true', () => {
      const outputDirPath = path.resolve(
        'public',
        'tmp',
        'output',
        mockIngredientId,
      );

      (fs.existsSync as Mock).mockReturnValue(true);
      (fs.rmSync as Mock).mockImplementation(() => {
        /* noop */
      });

      service.cleanupTempFiles(mockIngredientId, true);

      expect(fs.existsSync).toHaveBeenCalledWith(outputDirPath);
      expect(fs.rmSync).toHaveBeenCalledWith(outputDirPath, {
        force: true,
        recursive: true,
      });
    });

    it('should handle cleanup errors gracefully', () => {
      (fs.existsSync as Mock).mockReturnValue(true);
      (fs.rmSync as Mock).mockImplementation(() => {
        throw new Error('Permission denied');
      });

      expect(() => service.cleanupTempFiles(mockIngredientId)).not.toThrow();
      expect(loggerService.error).toHaveBeenCalled();
    });

    it('defaults isDeleteTempFilesEnabled to true', () => {
      expect(service.isDeleteTempFilesEnabled).toBe(true);
    });
  });
});
