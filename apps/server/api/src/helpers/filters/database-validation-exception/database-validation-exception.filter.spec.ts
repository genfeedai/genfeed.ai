import { type ArgumentsHost, HttpStatus } from '@nestjs/common';

vi.mock('jsonapi-serializer', () => ({
  Error: class JsonApiError {
    errors: unknown[];

    constructor(payload: unknown) {
      this.errors = [payload];
    }
  },
}));

vi.mock('@sentry/nestjs', () => ({
  captureException: vi.fn(),
}));

type FilterInstance = {
  catch(exception: Error, host: ArgumentsHost): void;
};
type FilterConstructor = new (
  loggerService: unknown,
  configService: unknown,
) => FilterInstance;

describe('DatabaseValidationExceptionFilter', () => {
  let DatabaseValidationExceptionFilterClass: FilterConstructor;
  let filter: FilterInstance;
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

  beforeAll(async () => {
    const module = await import(
      '@api/helpers/filters/database-validation-exception/database-validation-exception.filter'
    );
    DatabaseValidationExceptionFilterClass =
      module.DatabaseValidationExceptionFilter as unknown as FilterConstructor;
  });

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

    filter = new DatabaseValidationExceptionFilterClass(
      mockLoggerService,
      mockConfigService,
    );
  });

  it('should be defined', () => {
    expect(filter).toBeDefined();
  });

  it('should handle validation errors', () => {
    const exception = {
      errors: {
        email: {
          message: 'Email is required',
          path: 'email',
        },
        name: {
          message: 'Name must be at least 3 characters',
          path: 'name',
        },
      },
      message:
        'Validation failed: Email is required, Name must be at least 3 characters',
      name: 'ValidationError',
    };

    filter.catch(exception, mockArgumentsHost);

    // Logger is not called in production mode
    expect(mockLoggerService.error).not.toHaveBeenCalled();
    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);

    // Check that json was called
    expect(mockResponse.json).toHaveBeenCalled();
    const jsonCall = mockResponse.json.mock.calls[0][0];

    // Verify the structure
    expect(jsonCall).toHaveProperty('errors');
    expect(Array.isArray(jsonCall.errors)).toBe(true);

    // Check that we have a single error with the combined message
    expect(jsonCall.errors.length).toBe(1);
    expect(jsonCall.errors[0]).toMatchObject({
      // code is a string in JSONAPIError
      code: String(HttpStatus.BAD_REQUEST),
      detail:
        'Validation failed: Email is required, Name must be at least 3 characters',
      source: { pointer: '/test' },
      title: 'ValidationError',
    });
  });

  it('should handle validation errors without errors object', () => {
    const exception = {
      message: 'Validation failed',
      name: 'ValidationError',
    };

    filter.catch(exception, mockArgumentsHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({
            code: String(HttpStatus.BAD_REQUEST),
            detail: 'Validation failed',
            source: { pointer: '/test' },
            title: 'ValidationError',
          }),
        ]),
      }),
    );
  });
});
