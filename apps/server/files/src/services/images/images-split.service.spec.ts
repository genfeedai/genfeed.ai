import { ConfigService } from '@files/config/config.service';
import { ImagesSplitService } from '@files/services/images/images-split.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import type { Mock, Mocked } from 'vitest';

// Mock sharp module
vi.mock('sharp', () => {
  const mockSharp = vi.fn().mockImplementation(() => ({
    extract: vi.fn().mockReturnThis(),
    jpeg: vi.fn().mockReturnThis(),
    metadata: vi.fn().mockResolvedValue({
      height: 1000,
      width: 1000,
    }),
    toBuffer: vi.fn().mockResolvedValue(Buffer.from('mock-frame-data')),
  }));
  return mockSharp;
});

import sharp from 'sharp';

describe('ImagesSplitService', () => {
  let service: ImagesSplitService;
  let mockConfigService: Mocked<ConfigService>;
  let mockLogger: Mocked<LoggerService>;
  let mockSharpInstance: any;

  beforeEach(async () => {
    mockConfigService = {} as Mocked<ConfigService>;

    mockLogger = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    } as unknown as Mocked<LoggerService>;

    // Reset sharp mock
    mockSharpInstance = {
      extract: vi.fn().mockReturnThis(),
      jpeg: vi.fn().mockReturnThis(),
      metadata: vi.fn().mockResolvedValue({
        height: 1000,
        width: 1000,
      }),
      toBuffer: vi.fn().mockResolvedValue(Buffer.from('mock-frame-data')),
    };
    (sharp as Mock).mockReturnValue(mockSharpInstance);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ImagesSplitService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: LoggerService,
          useValue: mockLogger,
        },
      ],
    }).compile();

    service = module.get<ImagesSplitService>(ImagesSplitService);

    vi.clearAllMocks();
    (sharp as Mock).mockReturnValue(mockSharpInstance);
  });

  describe('initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });
  });

  describe('splitImage', () => {
    it('should split image into 2x2 grid', async () => {
      const buffer = Buffer.from('test-image');

      const result = await service.splitImage(buffer, 2, 2);

      expect(result).toHaveLength(4);
      expect(result[0].index).toBe(0);
      expect(result[1].index).toBe(1);
      expect(result[2].index).toBe(2);
      expect(result[3].index).toBe(3);
    });

    it('should split image into 3x3 grid', async () => {
      const buffer = Buffer.from('test-image');

      const result = await service.splitImage(buffer, 3, 3);

      expect(result).toHaveLength(9);
      expect(result[8].index).toBe(8);
    });

    it('should split image into 2x4 grid (non-square)', async () => {
      const buffer = Buffer.from('test-image');

      const result = await service.splitImage(buffer, 2, 4);

      expect(result).toHaveLength(8);
    });

    it('should apply default border inset of 10 pixels', async () => {
      const buffer = Buffer.from('test-image');

      await service.splitImage(buffer, 2, 2);

      // Cell width = 1000/2 = 500, with 10px inset: left=10, width=480
      expect(mockSharpInstance.extract).toHaveBeenCalledWith(
        expect.objectContaining({
          height: 480,
          left: 10,
          top: 10,
          width: 480,
        }),
      );
    });

    it('should apply custom border inset', async () => {
      const buffer = Buffer.from('test-image');
      const customInset = 20;

      await service.splitImage(buffer, 2, 2, customInset);

      expect(mockSharpInstance.extract).toHaveBeenCalledWith(
        expect.objectContaining({
          height: 460,
          left: 20,
          top: 20,
          width: 460,
        }),
      );
    });

    it('should clamp border inset if too large', async () => {
      const buffer = Buffer.from('test-image');
      // Cell is 500x500, max inset would be 249 (half - 1)
      const largeInset = 300;

      await service.splitImage(buffer, 2, 2, largeInset);

      // Should use clamped inset, not 300
      expect(mockSharpInstance.extract).toHaveBeenCalledWith(
        expect.objectContaining({
          height: expect.any(Number),
          // Width should be positive, meaning inset was clamped
          width: expect.any(Number),
        }),
      );

      // Verify width is positive (not negative from too large inset)
      const extractCall = mockSharpInstance.extract.mock.calls[0][0];
      expect(extractCall.width).toBeGreaterThan(0);
      expect(extractCall.height).toBeGreaterThan(0);
    });

    it('should return correct frame dimensions', async () => {
      const buffer = Buffer.from('test-image');

      const result = await service.splitImage(buffer, 2, 2);

      // Cell = 500, inset = 10, final = 480
      expect(result[0].width).toBe(480);
      expect(result[0].height).toBe(480);
    });

    it('should return buffer for each frame', async () => {
      const buffer = Buffer.from('test-image');

      const result = await service.splitImage(buffer, 2, 2);

      result.forEach((frame) => {
        expect(frame.buffer).toBeInstanceOf(Buffer);
        expect(frame.buffer.length).toBeGreaterThan(0);
      });
    });

    it('should log splitting operation', async () => {
      const buffer = Buffer.from('test-image');

      await service.splitImage(buffer, 2, 2);

      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('Splitting 1000x1000 image into 2x2 grid'),
        'ImagesSplitService',
      );

      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('Cell size: 500x500'),
        'ImagesSplitService',
      );
    });

    it('should log each frame extraction', async () => {
      const buffer = Buffer.from('test-image');

      await service.splitImage(buffer, 2, 2);

      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('Extracted frame 1/4'),
        'ImagesSplitService',
      );

      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('Extracted frame 4/4'),
        'ImagesSplitService',
      );
    });

    it('should log completion with total frame count', async () => {
      const buffer = Buffer.from('test-image');

      await service.splitImage(buffer, 3, 3);

      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('Successfully split image into 9 frames'),
        'ImagesSplitService',
      );
    });

    it('should throw error if image dimensions cannot be read', async () => {
      mockSharpInstance.metadata.mockResolvedValue({
        height: undefined,
        width: undefined,
      });

      const buffer = Buffer.from('test-image');

      await expect(service.splitImage(buffer, 2, 2)).rejects.toThrow(
        'Unable to read image dimensions',
      );
    });

    it('should throw error if width is missing', async () => {
      mockSharpInstance.metadata.mockResolvedValue({
        height: 1000,
        width: undefined,
      });

      const buffer = Buffer.from('test-image');

      await expect(service.splitImage(buffer, 2, 2)).rejects.toThrow(
        'Unable to read image dimensions',
      );
    });

    it('should throw error if height is missing', async () => {
      mockSharpInstance.metadata.mockResolvedValue({
        height: undefined,
        width: 1000,
      });

      const buffer = Buffer.from('test-image');

      await expect(service.splitImage(buffer, 2, 2)).rejects.toThrow(
        'Unable to read image dimensions',
      );
    });

    it('should handle extraction errors', async () => {
      const extractError = new Error('Extraction failed');
      mockSharpInstance.toBuffer.mockRejectedValueOnce(extractError);

      const buffer = Buffer.from('test-image');

      await expect(service.splitImage(buffer, 2, 2)).rejects.toThrow(
        'Extraction failed',
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to extract frame 1'),
        expect.any(String),
        'ImagesSplitService',
      );
    });

    it('should handle non-Error extraction failures', async () => {
      mockSharpInstance.toBuffer.mockRejectedValueOnce('String error');

      const buffer = Buffer.from('test-image');

      await expect(service.splitImage(buffer, 2, 2)).rejects.toThrow(
        'String error',
      );
    });

    it('should output JPEG with 95 quality', async () => {
      const buffer = Buffer.from('test-image');

      await service.splitImage(buffer, 2, 2);

      expect(mockSharpInstance.jpeg).toHaveBeenCalledWith({ quality: 95 });
    });

    it('should calculate correct positions for each cell in grid', async () => {
      mockSharpInstance.metadata.mockResolvedValue({
        height: 400,
        width: 600,
      });

      const buffer = Buffer.from('test-image');

      await service.splitImage(buffer, 2, 3, 5);

      // Grid: 2 rows, 3 cols
      // Cell width = 600/3 = 200, height = 400/2 = 200
      // With inset 5: actual width = 190, height = 190

      // First cell (0,0): left=5, top=5
      expect(mockSharpInstance.extract).toHaveBeenNthCalledWith(1, {
        height: 190,
        left: 5,
        top: 5,
        width: 190,
      });

      // Second cell (0,1): left=205, top=5
      expect(mockSharpInstance.extract).toHaveBeenNthCalledWith(2, {
        height: 190,
        left: 205,
        top: 5,
        width: 190,
      });

      // Fourth cell (1,0): left=5, top=205
      expect(mockSharpInstance.extract).toHaveBeenNthCalledWith(4, {
        height: 190,
        left: 5,
        top: 205,
        width: 190,
      });
    });
  });
});
