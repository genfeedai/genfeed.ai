// @ts-nocheck - Test utility file with extensive Jest mocking
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

export class TestHelpers {
  /**
   * Creates a mock logger service for testing
   */
  static createMockLogger(): vi.Mocked<LoggerService> {
    return {
      constructorName: 'MockLogger',
      debug: vi.fn(),
      error: vi.fn(),
      fatal: vi.fn(),
      isLevelEnabled: vi.fn(),
      log: vi.fn(),
      setContext: vi.fn(),
      setLogLevels: vi.fn(),
      verbose: vi.fn(),
      warn: vi.fn(),
    } as unknown;
  }

  /**
   * Creates a mock document-style model for testing
   */
  static createMockModel(modelName: string = 'TestModel') {
    return {
      aggregate: vi.fn(),
      aggregatePaginate: vi.fn(),
      constructor: vi.fn(),
      countDocuments: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
      deleteOne: vi.fn(),
      distinct: vi.fn(),
      exec: vi.fn(),
      find: vi.fn().mockReturnThis(),
      findById: vi.fn().mockReturnThis(),
      findByIdAndUpdate: vi.fn().mockReturnThis(),
      findOne: vi.fn().mockReturnThis(),
      findOneAndUpdate: vi.fn().mockReturnThis(),
      lean: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      modelName,
      new: vi.fn(),
      populate: vi.fn().mockReturnThis(),
      remove: vi.fn(),
      save: vi.fn(),
      select: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      updateMany: vi.fn(),
      updateOne: vi.fn(),
    };
  }

  /**
   * Creates a testing module with common providers
   */
  static createTestModule(
    controllers: unknown[] = [],
    providers: unknown[] = [],
    imports: unknown[] = [],
  ): Promise<TestingModule> {
    const commonProviders = [
      {
        provide: LoggerService,
        useValue: TestHelpers.createMockLogger(),
      },
    ];

    return Test.createTestingModule({
      controllers,
      imports,
      providers: [...commonProviders, ...providers],
    }).compile();
  }

  /**
   * Helper to mock axios responses
   */
  static mockAxiosResponse(data: unknown, status = 200) {
    return Promise.resolve({
      config: {},
      data,
      headers: {},
      status,
      statusText: 'OK',
    });
  }

  /**
   * Helper to mock axios errors
   */
  static mockAxiosError(message: string, status = 400) {
    const error = new Error(message) as Error & {
      response: {
        status: number;
        statusText: string;
        data: { message: string };
      };
    };
    error.response = {
      data: { message },
      status,
      statusText: 'Bad Request',
    };
    return Promise.reject(error);
  }

  /**
   * Helper to wait for async operations in tests
   */
  static waitFor(ms: number = 100): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Helper to generate test data with consistent structure
   */
  static generateTestData<T>(baseData: Partial<T>, count: number = 1): T[] {
    return Array.from(
      { length: count },
      (_, index) =>
        ({
          ...baseData,
          _id: '507f191e810c19729de860ee',
          createdAt: new Date(),
          testIndex: index,
          updatedAt: new Date(),
        }) as T,
    );
  }

  /**
   * Helper to mock HTTP request objects
   */
  static createMockRequest(overrides: unknown = {}) {
    return {
      body: {},
      headers: {
        authorization: 'Bearer test-token',
        'content-type': 'application/json',
      },
      method: 'GET',
      params: {},
      query: {},
      url: '/test',
      user: {
        email: 'test@example.com',
        id: 'test-user-id',
      },
      ...overrides,
    };
  }

  /**
   * Helper to mock HTTP response objects
   */
  static createMockResponse() {
    const res: unknown = {};
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    res.send = vi.fn().mockReturnValue(res);
    res.cookie = vi.fn().mockReturnValue(res);
    res.clearCookie = vi.fn().mockReturnValue(res);
    res.redirect = vi.fn().mockReturnValue(res);
    return res;
  }

  /**
   * Helper to verify mock function calls with specific arguments
   */
  static expectCallWith(mockFn: vi.Mock, ...expectedArgs: unknown[]) {
    expect(mockFn).toHaveBeenCalledWith(...expectedArgs);
  }

  /**
   * Helper to verify mock function call count
   */
  static expectCallCount(mockFn: vi.Mock, expectedCount: number) {
    expect(mockFn).toHaveBeenCalledTimes(expectedCount);
  }

  /**
   * Helper to verify async function throws specific error
   */
  static async expectAsyncThrow(
    asyncFn: () => Promise<unknown>,
    expectedError?: unknown,
  ) {
    if (expectedError) {
      await expect(asyncFn()).rejects.toThrow(expectedError);
    } else {
      await expect(asyncFn()).rejects.toThrow();
    }
  }

  /**
   * Helper to create mock JWT tokens for testing
   */
  static createMockJWT(payload: unknown = {}) {
    const defaultPayload = {
      email: 'test@example.com',
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
      sub: 'test-user-id',
      ...payload,
    };

    // Simple base64 encoding for testing (not secure, just for mocking)
    const header = Buffer.from(
      JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
    ).toString('base64');
    const payloadStr = Buffer.from(JSON.stringify(defaultPayload)).toString(
      'base64',
    );
    const signature = 'test-signature';

    return `${header}.${payloadStr}.${signature}`;
  }

  /**
   * Helper to create mock file upload objects
   */
  static createMockFile(overrides: unknown = {}) {
    return {
      buffer: Buffer.from('test file content'),
      encoding: '7bit',
      fieldname: 'file',
      filename: `test-file-${Date.now()}.jpg`,
      mimetype: 'image/jpeg',
      originalname: 'test-file.jpg',
      path: '/tmp/test-file.jpg',
      size: 1024,
      ...overrides,
    };
  }

  /**
   * Helper to reset all mocks in a test suite
   */
  static resetAllMocks() {
    vi.clearAllMocks();
    vi.resetAllMocks();
  }

  /**
   * Helper to mock Date.now() for consistent testing
   */
  static mockDateNow(timestamp?: number) {
    const mockTimestamp = timestamp || Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(mockTimestamp);
    return mockTimestamp;
  }

  /**
   * Helper to restore Date.now() after mocking
   */
  static restoreDateNow() {
    (Date.now as vi.Mock).mockRestore?.();
  }
}
