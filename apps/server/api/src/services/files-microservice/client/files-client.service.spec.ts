import { ConfigService } from '@api/config/config.service';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
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

  describe('resizeImageFromUrl', () => {
    it('should resize image URL successfully', async () => {
      const imageUrl = 'https://example.com/image.jpg';
      const target = { height: 600, width: 800 };
      const mockResponse = {
        data: { data: Buffer.from('resized-image').toString('base64') },
      };

      httpService.post.mockReturnValue(httpResponse(mockResponse.data));

      const result = await service.resizeImageFromUrl(imageUrl, target);

      expect(result).toBeInstanceOf(Buffer);
      expect(httpService.post).toHaveBeenCalledWith(
        `${mockFilesServiceUrl}/v1/files/processing/resize-image`,
        {
          height: target.height,
          imageUrl,
          width: target.width,
        },
      );
    });

    it('should handle errors when resizing image URL', async () => {
      const imageUrl = 'https://example.com/image.jpg';
      const target = { height: 600, width: 800 };
      const error = new Error('Processing error');

      httpService.post.mockReturnValue(throwError(() => error));

      await expect(
        service.resizeImageFromUrl(imageUrl, target),
      ).rejects.toThrow(error);
      expect(loggerService.error).toHaveBeenCalledWith(
        'Failed to resize image from URL',
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
