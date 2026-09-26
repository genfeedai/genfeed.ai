/**
 * End-to-end contract between `HttpExceptionFilter`'s real JSON:API output
 * (the real `jsonapi-serializer`, not a pass-through mock — a mock cannot
 * catch a real serializer dropping or renaming a field) and the client-side
 * error helpers in `@genfeedai/utils`. Exercises the exact shapes two real,
 * already-shipping exception factories throw — `ErrorResponse.notFound`
 * (coded `NOT_FOUND`) and the rate-limit guard (coded `RATE_LIMIT_EXCEEDED`)
 * — plus the new `BrandScrapeErrorCode` shape, because these coded 4xx/5xx
 * cases are the actual regression `writeJsonApiError` introduced by putting
 * a semantic `code` where the HTTP status used to be the only thing there
 * (#5080 review).
 */
import { ErrorResponse } from '@api/helpers/utils/error-response/error-response.util';
import {
  ErrorHandler,
  getErrorStatus,
} from '@genfeedai/utils/error/error-handler.util';
import { type ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';

vi.mock('@sentry/nestjs', () => ({
  captureException: vi.fn(),
}));

type FilterInstance = {
  catch(exception: unknown, host: ArgumentsHost): void;
};
type FilterConstructor = new (
  loggerService: unknown,
  configService: unknown,
) => FilterInstance;

describe('HttpExceptionFilter → @genfeedai/utils client contract (real jsonapi-serializer)', () => {
  let HttpExceptionFilterClass: FilterConstructor;
  let filter: FilterInstance;
  let mockResponse: {
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
  };
  let mockArgumentsHost: ArgumentsHost;

  beforeAll(async () => {
    const module = await import(
      '@api/helpers/filters/http-exception/http-exception.filter'
    );
    HttpExceptionFilterClass =
      module.HttpExceptionFilter as unknown as FilterConstructor;
  });

  beforeEach(() => {
    vi.clearAllMocks();

    const mockLoggerService = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };
    const mockConfigService = {
      get: vi.fn((key: string) =>
        key === 'SENTRY_ENVIRONMENT' ? 'production' : null,
      ),
    };
    const mockRequest = {
      body: {},
      headers: {},
      method: 'GET',
      originalUrl: '/v1/brands/brand_1/scrape',
      url: '/v1/brands/brand_1/scrape',
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
    } as unknown as ArgumentsHost;

    filter = new HttpExceptionFilterClass(mockLoggerService, mockConfigService);
  });

  it('resolves a coded 404 from the real ErrorResponse.notFound factory to a 404, not 500', () => {
    let exception: unknown;
    try {
      ErrorResponse.notFound('Brand', 'brand_1');
    } catch (thrown) {
      exception = thrown;
    }

    expect(exception).toBeInstanceOf(HttpException);
    filter.catch(exception, mockArgumentsHost);

    const body = mockResponse.json.mock.calls[0][0];
    expect(getErrorStatus(body)).toBe(HttpStatus.NOT_FOUND);
    const apiError = ErrorHandler.convertJsonApiError(
      body as Parameters<typeof ErrorHandler.convertJsonApiError>[0],
    );
    expect(apiError?.status).toBe(HttpStatus.NOT_FOUND);
    expect(apiError?.code).toBe('NOT_FOUND');
  });

  it('resolves a coded 429 matching the real rate-limit guard shape to a 429, not 500', () => {
    // The exact shape `RateLimitGuard` throws
    // (apps/server/api/src/shared/guards/rate-limit/rate-limit.guard.ts).
    const exception = new HttpException(
      {
        code: 'RATE_LIMIT_EXCEEDED',
        detail: 'Rate limit exceeded. Please retry after 30 seconds.',
        title: 'Too Many Requests',
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );

    filter.catch(exception, mockArgumentsHost);

    const body = mockResponse.json.mock.calls[0][0];
    expect(getErrorStatus(body)).toBe(HttpStatus.TOO_MANY_REQUESTS);
    const apiError = ErrorHandler.convertJsonApiError(
      body as Parameters<typeof ErrorHandler.convertJsonApiError>[0],
    );
    expect(apiError?.status).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect(apiError?.code).toBe('RATE_LIMIT_EXCEEDED');
  });

  it('resolves a classified brand-scrape 500 (BrandScrapeErrorCode.UNKNOWN) to a 500, not something else', () => {
    const exception = new HttpException(
      {
        code: 'BRAND_SCRAPE_UNKNOWN',
        detail: 'Failed to setup brand',
        title: 'Brand Setup Failed',
      },
      HttpStatus.INTERNAL_SERVER_ERROR,
    );

    filter.catch(exception, mockArgumentsHost);

    const body = mockResponse.json.mock.calls[0][0];
    expect(getErrorStatus(body)).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    const apiError = ErrorHandler.convertJsonApiError(
      body as Parameters<typeof ErrorHandler.convertJsonApiError>[0],
    );
    expect(apiError?.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(apiError?.code).toBe('BRAND_SCRAPE_UNKNOWN');
  });

  it('still resolves an uncoded exception (no code member at all) by its status', () => {
    const exception = new HttpException(
      { detail: 'Something went wrong', title: 'Error' },
      HttpStatus.BAD_REQUEST,
    );

    filter.catch(exception, mockArgumentsHost);

    const body = mockResponse.json.mock.calls[0][0];
    expect(getErrorStatus(body)).toBe(HttpStatus.BAD_REQUEST);
    expect(
      ErrorHandler.convertJsonApiError(
        body as Parameters<typeof ErrorHandler.convertJsonApiError>[0],
      )?.status,
    ).toBe(HttpStatus.BAD_REQUEST);
  });
});
