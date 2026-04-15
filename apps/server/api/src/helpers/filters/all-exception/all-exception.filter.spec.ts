import { AllExceptionFilter } from '@api/helpers/filters/all-exception/all-exception.filter';
import { type ArgumentsHost, HttpStatus } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';

vi.mock('@sentry/nestjs');

describe('AllExceptionFilter', () => {
  let filter: AllExceptionFilter;
  let mockLoggerService: {
    debug: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };
  let mockConfigService: {
    get: ReturnType<typeof vi.fn>;
    isProduction?: boolean;
  };
  let mockArgumentsHost: ArgumentsHost;
  let mockResponse: {
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
  };
  let mockRequest: { url: string; method: string };

  beforeEach(() => {
    // Clear all mocks
    vi.clearAllMocks();

    // Setup mock services
    mockLoggerService = {
      error: vi.fn(),
      log: vi.fn(),
    };

    mockConfigService = {
      get: vi.fn((key: string) => {
        if (key === 'GENFEEDAI_API_URL') {
          return 'http://api.example.com';
        }
        if (key === 'SENTRY_ENVIRONMENT') {
          return 'production';
        }
        if (key === 'SENTRY_DSN') {
          return 'https://test@sentry.io/123';
        }
        return null;
      }),
    };

    // Setup mock request and response
    mockRequest = {
      body: {},
      headers: {},
      method: 'GET',
      originalUrl: '/test',
      url: '/test',
    };

    mockResponse = {
      json: vi.fn().mockReturnThis(),
      status: vi.fn().mockReturnThis(),
    };

    mockArgumentsHost = {
      switchToHttp: vi.fn().mockReturnValue({
        getRequest: vi.fn().mockReturnValue(mockRequest),
        getResponse: vi.fn().mockReturnValue(mockResponse),
      }),
    };

    filter = new AllExceptionFilter(mockLoggerService, mockConfigService);
  });

  it('should be defined', () => {
    expect(filter).toBeDefined();
  });

  it('should handle generic exceptions', () => {
    const exception = new Error('Test error');

    filter.catch(exception, mockArgumentsHost);

    // Logger is always called regardless of environment
    expect(mockLoggerService.error).toHaveBeenCalled();
    expect(mockResponse.status).toHaveBeenCalledWith(
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
    // JSONAPIError wraps errors in an { errors: [...] } structure with code as string
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({
            code: String(HttpStatus.INTERNAL_SERVER_ERROR),
            detail: 'Test error',
            source: expect.any(Object),
            title: expect.any(String),
          }),
        ]),
      }),
    );
  });

  it('should capture exception to Sentry', () => {
    const exception = new Error('Test error');

    filter.catch(exception, mockArgumentsHost);

    expect(Sentry.captureException).toHaveBeenCalledWith(exception);
  });

  it('should log exception in development mode', () => {
    // Change to development mode
    mockConfigService.get.mockImplementation((key: string) => {
      if (key === 'GENFEEDAI_API_URL') {
        return 'http://api.example.com';
      }
      if (key === 'SENTRY_ENVIRONMENT') {
        return 'development';
      }
      if (key === 'SENTRY_DSN') {
        return 'https://test@sentry.io/123';
      }
      return null;
    });

    // Create new filter instance with development config
    const devFilter = new AllExceptionFilter(
      mockLoggerService,
      mockConfigService,
    );
    const exception = new Error('Test error');

    devFilter.catch(exception, mockArgumentsHost);

    expect(mockLoggerService.error).toHaveBeenCalledWith(
      'GET /test 500 — Test error',
      expect.objectContaining({
        operation: 'catch',
        service: 'AllExceptionFilter',
      }),
    );
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });
});
