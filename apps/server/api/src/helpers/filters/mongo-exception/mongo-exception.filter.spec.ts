import { MongoExceptionFilter } from '@api/helpers/filters/mongo-exception/mongo-exception.filter';
import { type ArgumentsHost, HttpStatus } from '@nestjs/common';

vi.mock('@sentry/nestjs', () => ({
  captureException: vi.fn(),
}));

describe('MongoExceptionFilter', () => {
  let filter: MongoExceptionFilter;
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

    filter = new MongoExceptionFilter(mockLoggerService, mockConfigService);
  });

  it('should be defined', () => {
    expect(filter).toBeDefined();
  });

  it('should handle MongoDB duplicate key error (code 11000)', () => {
    const exception = {
      code: 11000,
      keyPattern: { email: 1 },
      keyValue: { email: 'test@example.com' },
      message: 'E11000 duplicate key error',
    };

    filter.catch(exception, mockArgumentsHost);

    // Logger is not called in production mode
    expect(mockLoggerService.error).not.toHaveBeenCalled();
    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    // JSONAPIError wraps errors with code as string
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({
            code: String(HttpStatus.CONFLICT),
            detail: 'A record with this value already exists',
            source: expect.any(Object),
            title: 'Duplicate Entry',
          }),
        ]),
      }),
    );
  });

  it('should handle generic MongoDB errors', () => {
    const exception = {
      code: 50,
      message: 'MongoDB error',
    };

    filter.catch(exception, mockArgumentsHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({
            code: String(HttpStatus.BAD_REQUEST),
            detail: 'MongoDB error',
            source: expect.any(Object),
            title: expect.any(String),
          }),
        ]),
      }),
    );
  });
});
