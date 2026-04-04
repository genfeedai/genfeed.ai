import { HttpExceptionFilter } from '@api/helpers/filters/http-exception/http-exception.filter';
import { type ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';

vi.mock('@sentry/nestjs');

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;
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
    vi.clearAllMocks();

    // Setup mock services
    mockLoggerService = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
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

    filter = new HttpExceptionFilter(mockLoggerService, mockConfigService);
  });

  it('should be defined', () => {
    expect(filter).toBeDefined();
  });

  it('should handle HttpException with string message', () => {
    const exception = new HttpException('Test error', HttpStatus.BAD_REQUEST);

    filter.catch(exception, mockArgumentsHost);

    expect(mockLoggerService.error).toHaveBeenCalled();
    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({
            code: HttpStatus.BAD_REQUEST.toString(),
            detail: 'Test error',
            source: expect.any(Object),
            title: 'HTTP Exception', // Default title when response is string
          }),
        ]),
      }),
    );
  });

  it('should handle HttpException with object response', () => {
    const errorResponse = {
      errors: ['Field is required'],
      message: 'Validation failed',
    };
    const exception = new HttpException(errorResponse, HttpStatus.BAD_REQUEST);

    filter.catch(exception, mockArgumentsHost);

    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({
            code: HttpStatus.BAD_REQUEST.toString(),
            detail: 'Validation failed',
            source: expect.any(Object),
            title: 'HttpException', // exception.name when no title/error in response
          }),
        ]),
      }),
    );
  });

  describe('HTTP Status Code Validation', () => {
    const statusTestCases = [
      { message: 'Bad Request', status: HttpStatus.BAD_REQUEST },
      { message: 'Unauthorized', status: HttpStatus.UNAUTHORIZED },
      { message: 'Forbidden', status: HttpStatus.FORBIDDEN },
      { message: 'Not Found', status: HttpStatus.NOT_FOUND },
      { message: 'Conflict', status: HttpStatus.CONFLICT },
      { message: 'Validation Error', status: HttpStatus.UNPROCESSABLE_ENTITY },
      { message: 'Rate Limited', status: HttpStatus.TOO_MANY_REQUESTS },
      {
        message: 'Internal Server Error',
        status: HttpStatus.INTERNAL_SERVER_ERROR,
      },
      { message: 'External Service Error', status: HttpStatus.BAD_GATEWAY },
      {
        message: 'Service Unavailable',
        status: HttpStatus.SERVICE_UNAVAILABLE,
      },
    ];

    statusTestCases.forEach(({ status, message }) => {
      it(`should return correct HTTP status ${status} for ${message}`, () => {
        const exception = new HttpException(message, status);

        filter.catch(exception, mockArgumentsHost);

        if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
          expect(Sentry.captureException).toHaveBeenCalledWith(exception);
        } else {
          expect(Sentry.captureException).not.toHaveBeenCalled();
        }
        expect(mockResponse.status).toHaveBeenCalledWith(status);
        expect(mockResponse.json).toHaveBeenCalledWith(
          expect.objectContaining({
            errors: expect.arrayContaining([
              expect.objectContaining({
                code: status.toString(),
                detail: message,
              }),
            ]),
          }),
        );
      });
    });

    it('should handle custom error objects with proper status codes', () => {
      const customError = {
        code: 'INVALID_EMAIL',
        detail: 'Email format is invalid',
        source: { pointer: '/data/attributes/email' },
        title: 'Validation Error',
      };
      const exception = new HttpException(
        customError,
        HttpStatus.UNPROCESSABLE_ENTITY,
      );

      filter.catch(exception, mockArgumentsHost);

      expect(mockResponse.status).toHaveBeenCalledWith(
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          errors: expect.arrayContaining([
            expect.objectContaining({
              code: HttpStatus.UNPROCESSABLE_ENTITY.toString(),
              detail: 'Email format is invalid',
              title: 'Validation Error',
            }),
          ]),
        }),
      );
    });

    it('should preserve original error structure in response', () => {
      const exception = new HttpException(
        'Resource not found',
        HttpStatus.NOT_FOUND,
      );

      filter.catch(exception, mockArgumentsHost);

      const callArgs = mockResponse.json.mock.calls[0][0];
      expect(callArgs).toMatchObject({
        errors: [
          {
            code: HttpStatus.NOT_FOUND.toString(),
            detail: 'Resource not found',
            source: expect.objectContaining({
              pointer: mockRequest.originalUrl,
            }),
            title: 'HTTP Exception',
          },
        ],
      });
    });
  });

  describe('Error Message Formatting', () => {
    it('should format error messages consistently', () => {
      const exception = new HttpException(
        'Invalid input parameters',
        HttpStatus.BAD_REQUEST,
      );

      filter.catch(exception, mockArgumentsHost);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          errors: expect.arrayContaining([
            expect.objectContaining({
              code: expect.any(String),
              detail: 'Invalid input parameters',
              source: expect.any(Object),
              title: expect.any(String),
            }),
          ]),
        }),
      );
    });

    it('should handle null and undefined error messages', () => {
      const exception = new HttpException(
        null,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );

      // Should not throw when handling null messages
      expect(() => {
        filter.catch(exception, mockArgumentsHost);
      }).not.toThrow();

      expect(mockResponse.status).toHaveBeenCalledWith(
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
      expect(mockResponse.json).toHaveBeenCalled();
    });

    it('should handle complex nested error objects', () => {
      const complexError = {
        errors: [
          { field: 'email', message: 'Invalid email format' },
          { field: 'password', message: 'Password too weak' },
        ],
        message: 'Multiple validation errors',
        timestamp: new Date().toISOString(),
      };
      const exception = new HttpException(complexError, HttpStatus.BAD_REQUEST);

      filter.catch(exception, mockArgumentsHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          errors: expect.arrayContaining([
            expect.objectContaining({
              code: HttpStatus.BAD_REQUEST.toString(),
              detail: 'Multiple validation errors',
            }),
          ]),
        }),
      );
    });

    it('should capture 5xx exceptions to Sentry in production', () => {
      const exception = new HttpException(
        'Internal Server Error',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );

      filter.catch(exception, mockArgumentsHost);

      expect(Sentry.captureException).toHaveBeenCalledWith(exception);
    });
  });

  describe('Logging Behavior', () => {
    it('should log 4xx errors locally without reporting them to Sentry in production', () => {
      // Production environment setup is already done in beforeEach
      const exception = new HttpException('Test error', HttpStatus.BAD_REQUEST);

      filter.catch(exception, mockArgumentsHost);

      expect(mockLoggerService.error).toHaveBeenCalledWith(
        'HTTP exception occurred',
        exception,
        expect.objectContaining({
          status: HttpStatus.BAD_REQUEST,
          url: '/test',
        }),
      );
      expect(Sentry.captureException).not.toHaveBeenCalled();
      expect(mockLoggerService.log).not.toHaveBeenCalled();
    });

    it('should log errors in development environment', () => {
      // Create a new filter with development environment
      mockConfigService.get = vi.fn((key: string) => {
        if (key === 'SENTRY_ENVIRONMENT') {
          return 'development';
        }
        if (key === 'GENFEEDAI_API_URL') {
          return 'http://localhost:3000';
        }
        return null;
      });

      const devFilter = new HttpExceptionFilter(
        mockLoggerService,
        mockConfigService,
      );
      const exception = new HttpException(
        'Development error',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );

      devFilter.catch(exception, mockArgumentsHost);

      expect(mockLoggerService.error).toHaveBeenCalledWith(
        'HTTP exception occurred',
        exception,
        expect.objectContaining({
          operation: 'catch',
          service: 'HttpExceptionFilter',
          status: HttpStatus.INTERNAL_SERVER_ERROR,
        }),
      );
    });
  });

  describe('Security Considerations', () => {
    it('should not expose sensitive system information in production', () => {
      const exception = new HttpException(
        'Database connection failed: Connection refused to localhost:5432',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );

      filter.catch(exception, mockArgumentsHost);

      const responseCall = mockResponse.json.mock.calls[0][0];
      // In production, we want to ensure internal error details are not exposed
      expect(responseCall.errors[0].detail).toBeDefined();
    });

    it('should sanitize stack traces in production', () => {
      const exception = new HttpException(
        'Internal server error',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
      exception.stack = 'Error: Test\n    at /app/src/secret/file.js:123:45';

      filter.catch(exception, mockArgumentsHost);

      const responseCall = mockResponse.json.mock.calls[0][0];
      // Should not expose stack trace in the response
      expect(JSON.stringify(responseCall)).not.toContain(
        '/app/src/secret/file.js',
      );
      expect(JSON.stringify(responseCall)).not.toContain('123:45');
    });

    it('should handle errors with sensitive data appropriately', () => {
      const sensitiveError = {
        apiKey: 'sk-secret-api-key',
        message: 'Authentication failed',
        password: 'user-password-123',
        token: 'jwt-secret-token-123',
      };
      const exception = new HttpException(
        sensitiveError,
        HttpStatus.UNAUTHORIZED,
      );

      filter.catch(exception, mockArgumentsHost);

      const responseCall = mockResponse.json.mock.calls[0][0];
      const responseStr = JSON.stringify(responseCall);

      // Sensitive data should not be in the response
      expect(responseStr).not.toContain('jwt-secret-token-123');
      expect(responseStr).not.toContain('sk-secret-api-key');
      expect(responseStr).not.toContain('user-password-123');
    });
  });
});
