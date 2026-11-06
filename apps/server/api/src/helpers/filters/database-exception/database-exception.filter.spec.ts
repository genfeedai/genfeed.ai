import { runWithWideEvent } from '@libs/logger/wide-event/wide-event.context';
import { startWideEvent } from '@libs/logger/wide-event/wide-event.lifecycle';
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

const sentry = vi.hoisted(() => ({ captured: [] as unknown[] }));
vi.mock('@sentry/nestjs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sentry/nestjs')>()),
  captureException: (exception: unknown) => {
    sentry.captured.push(exception);
    return 'event-id';
  },
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
  let filter: FilterInstance;
  let written: { body?: unknown; status?: number };
  let host: ArgumentsHost;

  beforeAll(async () => {
    const module = await import(
      '@api/helpers/filters/database-exception/database-exception.filter'
    );
    DatabaseExceptionFilterClass =
      module.DatabaseExceptionFilter as unknown as FilterConstructor;
  });

  beforeEach(() => {
    sentry.captured.length = 0;
    written = {};
    const response = {
      json: (body: unknown) => {
        written.body = body;
        return response;
      },
      status: (status: number) => {
        written.status = status;
        return response;
      },
    };
    host = {
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'GET',
          originalUrl: '/test',
          url: '/test',
        }),
        getResponse: () => response,
      }),
    } as unknown as ArgumentsHost;

    filter = new DatabaseExceptionFilterClass(
      { error: () => {} },
      {
        get: (key: string) =>
          key === 'SENTRY_ENVIRONMENT' ? 'production' : null,
      },
    );
  });

  const prismaError = (code: string, message = 'expected') => ({
    code,
    message,
    name: 'PrismaClientKnownRequestError',
  });

  it('answers a duplicate constraint with a JSON:API conflict', () => {
    filter.catch(prismaError('P2002', 'Unique constraint failed'), host);

    expect(written).toEqual({
      body: {
        errors: [
          expect.objectContaining({
            code: String(HttpStatus.CONFLICT),
            detail: 'A record with this value already exists',
            title: 'Duplicate Entry',
          }),
        ],
      },
      status: HttpStatus.CONFLICT,
    });
  });

  it('records the Prisma error code and mapped status on the wide event', () => {
    const { event } = startWideEvent({
      identity: { service: 'api' },
      kind: 'http',
      requestId: 'req-1',
      trace: { spanId: 'span-1', traceId: 'trace-1' },
    });

    runWithWideEvent(event, () =>
      filter.catch(prismaError('P2002', 'Unique constraint failed'), host),
    );

    expect(event.error).toMatchObject({
      code: 'P2002',
      status: HttpStatus.CONFLICT,
      type: 'PrismaClientKnownRequestError',
    });
  });

  it.each([
    ['P2002', HttpStatus.CONFLICT],
    ['P2025', HttpStatus.NOT_FOUND],
  ])('maps %s to %i without paging error tracking', (code, status) => {
    filter.catch(prismaError(code), host);

    expect(written.status).toBe(status);
    expect(sentry.captured).toEqual([]);
  });

  it('keeps a foreign-key violation out of error tracking', () => {
    filter.catch(prismaError('P2003'), host);

    expect(sentry.captured).toEqual([]);
  });

  it('reports an unexpected Prisma error to error tracking', () => {
    const exception = {
      message: 'Unknown argument `label`',
      name: 'PrismaClientValidationError',
    };

    filter.catch(exception, host);

    expect(sentry.captured).toEqual([exception]);
  });

  it('answers a non-Prisma error as an internal server error', () => {
    filter.catch(new Error('plain error'), host);

    expect(written.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
  });
});
