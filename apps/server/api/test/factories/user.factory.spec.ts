import {
  createMockDecorator,
  createMockExecutionContext,
  createMockGuard,
  createMockInterceptor,
  createTestingModule,
  mockAuthRequest,
} from '@test/mocks/controller.mocks';
import {
  createMockObjectId,
  mockAsyncIterator,
  mockCacheService,
  mockClerkService,
  mockConfigService,
  mockCreditTransactionsService,
  mockFile,
  mockFileQueueService,
  mockHttpService,
  mockLoggerService,
  mockModel,
  mockNext,
  mockPaginatedResult,
  mockPublicMetadata,
  mockRepository,
  mockRequest,
  mockResponse,
} from '@test/mocks/service.mocks';

afterEach(() => {
  vi.clearAllMocks();
});

describe('Controller mocks', () => {
  it('builds an execution context with overrides', () => {
    const ctx = createMockExecutionContext({
      request: { method: 'POST', route: { path: '/custom' } },
      response: { status: vi.fn() },
    });

    const request = ctx.switchToHttp().getRequest();
    expect(request.method).toBe('POST');
    expect(request.route.path).toBe('/custom');
  });

  it('creates guards and interceptors', () => {
    const guard = createMockGuard();
    expect(guard.canActivate()).toBe(true);

    const interceptor = createMockInterceptor({ ok: true });
    const stream = interceptor.intercept();
    expect(stream.pipe).toBeDefined();
    expect(stream.pipe()).toEqual({ ok: true });
  });

  it('provides decorators and auth requests', () => {
    const decorator = createMockDecorator();
    expect(typeof decorator).toBe('function');

    const request = mockAuthRequest({ headers: { authorization: 'Bearer x' } });
    expect(request.headers.authorization).toBe('Bearer x');
    expect(request.publicMetadata.organization).toBeDefined();
  });

  it('builds testing modules with logger disabled', async () => {
    const moduleRef = await createTestingModule({
      controllers: [],
      imports: [],
      providers: [],
    });

    expect(moduleRef).toBeDefined();
  });
});

describe('Service mocks', () => {
  it('builds request/response mocks and basic services', () => {
    const request = mockRequest({ params: { id: '123' } });
    expect(request.params.id).toBe('123');

    const response = mockResponse();
    expect(response.status(200)).toBe(response);
    expect(mockLoggerService().log).toBeDefined();
    expect(mockConfigService({ FOO: 'bar' }).get?.('FOO')).toBe('bar');
    expect(mockCacheService().generateKey?.('a', 'b')).toBe('a:b');
    mockNext();
    expect(mockNext).toHaveBeenCalled();
  });

  it('creates repositories and models with expected methods', async () => {
    const repository = mockRepository<{ name: string }>();
    await repository.save({ name: 'test' });
    expect(repository.find).toBeDefined();

    const model = mockModel<{ name: string }>();
    const paginated = await model.aggregatePaginate();
    expect(paginated.totalDocs).toBe(0);
  });

  it('mocks external services', () => {
    const clerk = mockClerkService();
    const queue = mockFileQueueService();
    const credit = mockCreditTransactionsService();

    expect(clerk.getUser).toBeDefined();
    expect(queue.processVideo).toBeDefined();
    expect(credit.createTransactionEntry).toBeDefined();
  });

  it('mocks HTTP service responses', (done) => {
    const http = mockHttpService();
    http.get?.('/').subscribe((response) => {
      expect(response.status).toBe(200);
      done();
    });
  });

  it('provides metadata and pagination helpers', () => {
    expect(mockPaginatedResult([1, 2]).totalDocs).toBe(2);
    expect(mockPublicMetadata().email).toBeDefined();
  });

  it('creates object ids, async iterators, and files', async () => {
    const id = createMockObjectId();
    expect(id).toBeDefined();

    const items: number[] = [];
    for await (const value of mockAsyncIterator([1, 2])) {
      items.push(value);
    }
    expect(items).toEqual([1, 2]);

    const file = mockFile({ originalname: 'custom.txt' });
    expect(file.originalname).toBe('custom.txt');
  });
});
