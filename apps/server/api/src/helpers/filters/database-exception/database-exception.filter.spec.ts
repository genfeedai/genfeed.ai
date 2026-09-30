import { type ArgumentsHost, HttpStatus } from '@nestjs/common';

const jsonApiSerializerMock = {
  Error: class JsonApiError {
    errors: unknown[];

    constructor(payload: unknown) {
      this.errors = [payload];
    }
  },
};

vi.mock('jsonapi-serializer', () => ({
  ...jsonApiSerializerMock,
  default: jsonApiSerializerMock,
}));

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

describe('DatabaseExceptionFilter', () => {
  let DatabaseExceptionFilterClass: FilterConstructor;
  let Sentry: typeof import('@sentry/nestjs');
  let filter: FilterInstance;
  let mockLoggerService: { error: ReturnType<typeof vi.fn> };
  let mockConfigService: { get: ReturnType<typeof vi.fn> };
  let mockArgumentsHost: ArgumentsHost;
  let mockResponse: {
    json: ReturnType<typeof vi.fn>;
    status: ReturnType<typeof vi.fn>;
  };

  beforeAll(async () => {
    const module = await import(
      '@api/helpers/filters/database-exception/database-exception.filter'
    );
    DatabaseExceptionFilterClass =
      module.DatabaseExceptionFilter as unknown as FilterConstructor;
    Sentry = await import('@sentry/nestjs');
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockLoggerService = { error: vi.fn() };
    mockConfigService = {
      get: vi.fn((key: string) =>
        key === 'SENTRY_ENVIRONMENT' ? 'production' : null,
      ),
    };
    mockResponse = {
      json: vi.fn().mockReturnThis(),
      status: vi.fn().mockReturnThis(),
    };
    mockArgumentsHost = {
      switchToHttp: vi.fn().mockReturnValue({
        getRequest: vi.fn().mockReturnValue({
          method: 'GET',
          originalUrl: '/test',
          url: '/test',
        }),
        getResponse: vi.fn().mockReturnValue(mockResponse),
      }),
    } as unknown as ArgumentsHost;

    filter = new DatabaseExceptionFilterClass(
      mockLoggerService,
      mockConfigService,
    );
  });

  it('handles Prisma duplicate constraint errors', () => {
    filter.catch(
      {
        code: 'P2002',
        message: 'Unique constraint failed',
        name: 'PrismaClientKnownRequestError',
      },
      mockArgumentsHost,
    );

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({
            code: String(HttpStatus.CONFLICT),
            detail: 'A record with this value already exists',
            title: 'Duplicate Entry',
          }),
        ]),
      }),
    );
  });

  it('handles Prisma missing record errors', () => {
    filter.catch(
      {
        code: 'P2025',
        message: 'Record not found',
        name: 'PrismaClientKnownRequestError',
      },
      mockArgumentsHost,
    );

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
  });

  it('does not report expected client-level Prisma errors to Sentry', () => {
    for (const code of ['P2002', 'P2003', 'P2025']) {
      filter.catch(
        { code, message: 'expected', name: 'PrismaClientKnownRequestError' },
        mockArgumentsHost,
      );
    }

    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('reports unexpected Prisma errors to Sentry', () => {
    filter.catch(
      {
        message: 'Unknown argument `label`',
        name: 'PrismaClientValidationError',
      },
      mockArgumentsHost,
    );

    expect(Sentry.captureException).toHaveBeenCalled();
  });

  it('delegates non-Prisma errors to the base filter', () => {
    filter.catch(new Error('plain error'), mockArgumentsHost);

    expect(mockResponse.status).toHaveBeenCalledWith(
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  });
});
