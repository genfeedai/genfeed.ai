import type { ConfigService } from '@api/config/config.service';
import { GiphyService } from '@api/services/integrations/giphy/giphy.service';
import type { LoggerService } from '@libs/logger/logger.service';
import type { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';

describe('GiphyService', () => {
  let service: GiphyService;
  let httpService: { post: ReturnType<typeof vi.fn> };
  let loggerService: {
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
  };
  let configService: { get: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    httpService = {
      post: vi.fn(),
    };
    loggerService = {
      error: vi.fn(),
      log: vi.fn(),
    };
    configService = {
      get: vi.fn().mockReturnValue('test-giphy-key'),
    };

    service = new GiphyService(
      configService as unknown as ConfigService,
      loggerService as unknown as LoggerService,
      httpService as unknown as HttpService,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('reads GIPHY_API_KEY from config on construction', () => {
    expect(configService.get).toHaveBeenCalledWith('GIPHY_API_KEY');
  });

  it('uploadGif posts to the Giphy upload URL', async () => {
    httpService.post.mockReturnValue(
      of({ data: { data: { id: 'gif-abc123' } } }),
    );

    // Mock fs.createReadStream
    vi.mock('node:fs', () => ({
      default: {
        createReadStream: vi.fn().mockReturnValue('mock-stream'),
      },
    }));

    const result = await service.uploadGif('/tmp/test.gif', 'ai,funny');
    expect(result).toBe('gif-abc123');
    expect(httpService.post).toHaveBeenCalledWith(
      'https://upload.giphy.com/v1/gifs',
      expect.anything(),
      expect.objectContaining({ headers: expect.anything() }),
    );
  });

  it('uploadGif returns empty string when no id in response', async () => {
    httpService.post.mockReturnValue(of({ data: { data: {} } }));
    const result = await service.uploadGif('/tmp/test.gif');
    expect(result).toBe('');
  });

  it('uploadGif throws on HTTP error', async () => {
    httpService.post.mockReturnValue(
      throwError(() => new Error('Network error')),
    );
    await expect(service.uploadGif('/tmp/test.gif')).rejects.toThrow(
      'Network error',
    );
  });

  it('uploadGif logs error on failure', async () => {
    httpService.post.mockReturnValue(throwError(() => new Error('Timeout')));
    try {
      await service.uploadGif('/tmp/test.gif');
    } catch {
      // expected
    }
    expect(loggerService.error).toHaveBeenCalled();
  });

  it('uploadGif logs success on successful upload', async () => {
    httpService.post.mockReturnValue(of({ data: { data: { id: 'gif-123' } } }));
    await service.uploadGif('/tmp/test.gif');
    expect(loggerService.log).toHaveBeenCalled();
  });

  it('uses default api key when config returns falsy', () => {
    configService.get.mockReturnValue('');
    const svc = new GiphyService(
      configService as unknown as ConfigService,
      loggerService as unknown as LoggerService,
      httpService as unknown as HttpService,
    );
    expect(svc).toBeDefined();
  });
});
