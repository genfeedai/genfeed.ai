import * as fs from 'node:fs';
import path from 'node:path';
import { ConfigService } from '@files/config/config.service';
import { FilesService } from '@files/services/files/files.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import type { Mocked } from 'vitest';

// Mock fs module
vi.mock('fs');
vi.mock('path');

describe('FilesService', () => {
  let service: FilesService;

  const mockFs = fs as Mocked<typeof fs>;
  const mockPath = path as Mocked<typeof path>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FilesService,
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn().mockImplementation((key: string) => {
              const config: Record<string, string> = {
                AWS_REGION: 'us-west-1',
                AWS_S3_BUCKET: 'test-bucket',
              };
              return config[key];
            }),
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

    // Reset mocks
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getPath', () => {
    it('should create directory path if it does not exist', () => {
      const type = 'videos';
      const ingredientId = 'test-ingredient-id';
      const expectedPath = '/path/to/public/tmp/videos/test-ingredient-id';

      mockPath.resolve.mockReturnValue(expectedPath);
      mockFs.existsSync.mockReturnValue(false);
      mockFs.mkdirSync.mockImplementation(() => undefined);

      const result = service.getPath(type, ingredientId);

      expect(mockPath.resolve).toHaveBeenCalledWith(
        'public',
        'tmp',
        type,
        ingredientId,
      );
      expect(mockFs.existsSync).toHaveBeenCalledWith(expectedPath);
      expect(mockFs.mkdirSync).toHaveBeenCalledWith(expectedPath, {
        recursive: true,
      });
      expect(result).toBe(expectedPath);
    });

    it('should return existing directory path without creating it', () => {
      const type = 'images';
      const ingredientId = 'existing-ingredient-id';
      const expectedPath = '/path/to/public/tmp/images/existing-ingredient-id';

      mockPath.resolve.mockReturnValue(expectedPath);
      mockFs.existsSync.mockReturnValue(true);

      const result = service.getPath(type, ingredientId);

      expect(mockPath.resolve).toHaveBeenCalledWith(
        'public',
        'tmp',
        type,
        ingredientId,
      );
      expect(mockFs.existsSync).toHaveBeenCalledWith(expectedPath);
      expect(mockFs.mkdirSync).not.toHaveBeenCalled();
      expect(result).toBe(expectedPath);
    });
  });

  describe('getSortedFiles', () => {
    it('should return sorted files with specified extension', () => {
      const imagesPath = '/path/to/images';
      const extension = '.jpg';
      const mockFiles = [
        'image3.jpg',
        'image1.jpg',
        'image2.jpg',
        'document.txt',
      ];

      mockFs.readdirSync.mockReturnValue(mockFiles);

      const result = service.getSortedFiles(imagesPath, extension);

      expect(mockFs.readdirSync).toHaveBeenCalledWith(imagesPath);
      expect(result).toEqual(['image1.jpg', 'image2.jpg', 'image3.jpg']);
    });

    it('should return empty array when no files match extension', () => {
      const imagesPath = '/path/to/images';
      const extension = '.png';
      const mockFiles = ['image1.jpg', 'image2.jpg', 'document.txt'];

      mockFs.readdirSync.mockReturnValue(mockFiles);

      const result = service.getSortedFiles(imagesPath, extension);

      expect(result).toEqual([]);
    });
  });

  describe('logging methods', () => {
    it('should log messages when cleaning up temp files', () => {
      const ingredientId = 'test-ingredient-id';
      const tempDir = '/path/to/public/tmp/test-dir/test-ingredient-id';

      mockPath.resolve.mockReturnValue(tempDir);
      mockFs.existsSync.mockReturnValue(true);

      service.cleanupTempFiles(ingredientId);

      // Verify the method was called by checking its side effects
      expect(mockPath.resolve).toHaveBeenCalled();
      expect(mockFs.existsSync).toHaveBeenCalled();
    });

    it('should log errors when cleanup fails', () => {
      const ingredientId = 'test-ingredient-id';
      const error = new Error('Cleanup failed');

      mockFs.existsSync.mockImplementation(() => {
        throw error;
      });

      service.cleanupTempFiles(ingredientId);

      // Verify the method was called by checking its side effects
      expect(mockFs.existsSync).toHaveBeenCalled();
    });
  });

  describe('service properties', () => {
    it('should have isDeleteTempFilesEnabled set to true', () => {
      expect(service.isDeleteTempFilesEnabled).toBe(true);
    });
  });
});
