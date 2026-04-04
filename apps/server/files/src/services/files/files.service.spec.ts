import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import path from 'node:path';
import { ConfigService } from '@files/config/config.service';
import { FilesService } from '@files/services/files/files.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import * as sharp from 'sharp';
import type { Mock, Mocked } from 'vitest';

vi.mock('fs');
vi.mock('sharp');
vi.mock('child_process');
vi.mock('axios');

describe('FilesService', () => {
  let service: FilesService;
  let loggerService: Mocked<LoggerService>;

  const mockBuffer = Buffer.from('test');
  const mockIngredientId = 'test-ingredient-123';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FilesService,
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn(),
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

    service = module.get<FilesService>(FilesService);
    loggerService = module.get(LoggerService);

    vi.clearAllMocks();
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
        toBuffer: vi.fn().mockResolvedValue(mockResizedBuffer),
      };

      (sharp as Mock).mockReturnValue(mockSharpInstance);

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
        toBuffer: vi.fn().mockRejectedValue(mockError),
      };

      (sharp as Mock).mockReturnValue(mockSharpInstance);

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

      const mockProcess = {
        on: vi.fn((event, callback) => {
          if (event === 'close') {
            callback(0);
          }
        }),
        stderr: { on: vi.fn() },
        stdout: { on: vi.fn() },
      };

      (spawn as Mock).mockReturnValue(mockProcess);
      service.runFfmpeg = vi.fn().mockResolvedValue(undefined);

      const result = await service.resizeVideo(inputPath, target);

      expect(result).toBe(expectedOutputPath);
    });

    it('should handle resize errors', async () => {
      const inputPath = '/tmp/video.mp4';
      const target = { height: 720, width: 1280 };

      service.runFfmpeg = vi.fn().mockRejectedValue(new Error('FFmpeg failed'));

      await expect(service.resizeVideo(inputPath, target)).rejects.toThrow(
        'FFmpeg failed',
      );
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

    it('should cleanup output file when enabled', () => {
      const outputPath = path.resolve(
        'public',
        'tmp',
        'outputs',
        `${mockIngredientId}_final.mp4`,
      );

      (fs.existsSync as Mock).mockReturnValue(true);
      (fs.unlinkSync as Mock).mockImplementation(() => {
        /* noop */
      });

      service.cleanupTempFiles(mockIngredientId, true);

      expect(fs.existsSync).toHaveBeenCalledWith(outputPath);
      expect(fs.unlinkSync).toHaveBeenCalledWith(outputPath);
    });

    it('should handle cleanup errors gracefully', () => {
      (fs.existsSync as Mock).mockReturnValue(true);
      (fs.rmSync as Mock).mockImplementation(() => {
        throw new Error('Permission denied');
      });

      expect(() => service.cleanupTempFiles(mockIngredientId)).not.toThrow();
      expect(loggerService.error).toHaveBeenCalled();
    });

    it('should not cleanup when disabled', () => {
      service.isDeleteTempFilesEnabled = false;

      service.cleanupTempFiles(mockIngredientId);

      expect(fs.rmSync).not.toHaveBeenCalled();
      expect(fs.unlinkSync).not.toHaveBeenCalled();
    });
  });

  describe('log methods', () => {
    it('should log messages', () => {
      const message = 'Test log message';
      service.log(message);

      expect(loggerService.log).toHaveBeenCalledWith(message);
    });

    it('should log errors', () => {
      const message = 'Test error message';
      const error = new Error('Test error');
      service.error(message, error);

      expect(loggerService.error).toHaveBeenCalledWith(message, error);
    });
  });
});
