import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

// Mock dependencies
function normalizeRelationshipGraph<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeRelationshipGraph(item)) as T;
  }

  if (
    typeof value !== 'object' ||
    value === null ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    return value;
  }

  const record = value as Record<string, unknown>;
  if (typeof record.id === 'string' && Object.keys(record).length === 1) {
    return record.id as T;
  }

  return Object.fromEntries(
    Object.entries(record).map(([key, item]) => [
      key,
      normalizeRelationshipGraph(item),
    ]),
  ) as T;
}

vi.mock('@services/core/json-api', () => ({
  deserializeCollection: vi.fn((doc) => doc.data || []),
  deserializeResource: vi.fn((doc) => doc.data || {}),
  extractCollection: vi.fn((doc) => normalizeRelationshipGraph(doc.data || [])),
  extractResource: vi.fn((doc) => normalizeRelationshipGraph(doc.data || {})),
}));

vi.mock('@services/content/pages.service', () => ({
  PagesService: {
    setCurrentPage: vi.fn(),
    setTotalDocs: vi.fn(),
    setTotalPages: vi.fn(),
  },
}));

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: {
    apiEndpoint: 'https://api.genfeed.ai/v1',
  },
}));

vi.mock('@services/core/interceptor.service', () => ({
  HTTPBaseService: class MockHTTPBaseService {
    protected baseURL: string;
    protected instance: {
      get: ReturnType<typeof vi.fn>;
      post: ReturnType<typeof vi.fn>;
      patch: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
    };

    constructor(baseURL: string, _token: string) {
      this.baseURL = baseURL;
      this.instance = {
        delete: vi.fn(),
        get: vi.fn(),
        patch: vi.fn(),
        post: vi.fn(),
      };
    }
  },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

import type { IServiceSerializer } from '@genfeedai/contracts/interfaces/utils/error.interface';
import { PagesService } from '@services/content/pages.service';
// Import after mocks
import {
  BaseService,
  type JsonApiResponseDocument,
} from '@services/core/base.service';
import { logger } from '@services/core/logger.service';

// Create a concrete implementation for testing
class TestModel {
  id: string;
  name: string;

  constructor(partial: Partial<TestModel>) {
    this.id = partial.id || '';
    this.name = partial.name || '';
  }
}

const mockSerializer: IServiceSerializer<TestModel> = {
  deserialize: vi.fn((data) => new TestModel(data)),
  serialize: vi.fn((data) => data),
};

class TestService extends BaseService<TestModel> {
  constructor(token: string) {
    super('/test', token, TestModel, mockSerializer);
  }

  public setValidationSchema(schema: z.ZodType) {
    this.responseSchema = schema;
    this.itemSchema = schema;
  }

  // Expose protected methods for testing
  public testMapMany(document: unknown) {
    return this.mapMany(document as JsonApiResponseDocument);
  }

  public testMapOne(document: unknown) {
    return this.mapOne(document as JsonApiResponseDocument);
  }

  public testExtractResource<D>(document: unknown) {
    return this.extractResource<D>(document as JsonApiResponseDocument);
  }

  public testExtractCollection<D>(document: unknown) {
    return this.extractCollection<D>(document as JsonApiResponseDocument);
  }

  public getInstanceForTest() {
    return vi.mocked(this.instance);
  }

  public testHandleOperationError(operation: string, error: unknown) {
    return this.handleOperationError(operation, error);
  }
}

class OtherTestService extends BaseService<TestModel> {
  constructor(token: string) {
    super('/other', token, TestModel, mockSerializer);
  }
}

class MultiArgTestService extends BaseService<TestModel> {
  public readonly organizationId: string;

  constructor(token: string, organizationId: string) {
    super(`/org/${organizationId}/test`, token, TestModel, mockSerializer);
    this.organizationId = organizationId;
  }
}

describe('BaseService', () => {
  let service: TestService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new TestService('test-token');
  });

  afterEach(() => {
    vi.clearAllMocks();
    BaseService.clearAllInstances();
  });

  describe('handleOperationError', () => {
    it('does not throw TypeError when the original error is missing', () => {
      expect(() =>
        service.testHandleOperationError('collectAllPages', undefined),
      ).toThrow(
        expect.objectContaining({
          isTimeout: false,
          message: 'Service operation failed',
        }),
      );
    });

    it('converts a rejected JSON:API object payload into a ServiceOperationError', () => {
      const payload = {
        errors: [
          {
            code: '422',
            detail: 'Unsorted shelf is temporarily unavailable',
            meta: { email: 'user@example.com', token: 'secret-token' },
            title: 'Ingredient query failed',
          },
        ],
        request: { body: { password: 'super-secret' } },
      };

      expect(() =>
        service.testHandleOperationError('GET /ingredients', payload),
      ).toThrow(
        expect.objectContaining({
          category: 'Ingredient query failed',
          message: 'Unsorted shelf is temporarily unavailable',
          name: 'ServiceOperationError',
          status: 422,
        }),
      );

      try {
        service.testHandleOperationError('GET /ingredients', payload);
      } catch (thrown) {
        expect(thrown).toBeInstanceOf(Error);
        expect(thrown).not.toHaveProperty('originalError');
        expect(JSON.stringify(thrown)).not.toContain('user@example.com');
        expect(JSON.stringify(thrown)).not.toContain('secret-token');
        expect(JSON.stringify(thrown)).not.toContain('super-secret');
      }

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('GET /ingredients failed'),
        expect.objectContaining({
          reportToSentry: false,
          tags: expect.objectContaining({
            error_category: 'Ingredient query failed',
            operation: 'GET /ingredients',
          }),
        }),
      );
    });
  });

  describe('getInstance', () => {
    it('should return a subclass instance from the shared factory path', () => {
      const instance = BaseService.getDataServiceInstance(
        TestService,
        'token-1',
      );
      expect(instance).toBeInstanceOf(TestService);
      expect(instance).toHaveProperty(
        'baseURL',
        'https://api.genfeed.ai/v1/test',
      );
    });

    it('should create new instances for different tokens', () => {
      const instance1 = BaseService.getDataServiceInstance(
        TestService,
        'token-1',
      );
      const instance2 = BaseService.getDataServiceInstance(
        TestService,
        'token-2',
      );

      expect(instance1).toBeInstanceOf(TestService);
      expect(instance2).toBeInstanceOf(TestService);
      expect(instance1).not.toBe(instance2);
    });

    it('should isolate caches across subclasses that share the same token', () => {
      const instance1 = BaseService.getDataServiceInstance(
        TestService,
        'token-1',
      );
      const instance2 = BaseService.getDataServiceInstance(
        OtherTestService,
        'token-1',
      );

      expect(instance1).toBeInstanceOf(TestService);
      expect(instance2).toBeInstanceOf(OtherTestService);
      expect(instance1).not.toBe(instance2);
      expect(instance2).toHaveProperty(
        'baseURL',
        'https://api.genfeed.ai/v1/other',
      );
    });

    it('should create distinct multi-arg instances when the token changes for the same organization', () => {
      const instance1 = BaseService.getDataServiceInstance(
        MultiArgTestService,
        'token-1',
        'org-1',
      );
      const instance2 = BaseService.getDataServiceInstance(
        MultiArgTestService,
        'token-2',
        'org-1',
      );

      expect(instance1).not.toBe(instance2);
      expect(instance1).toHaveProperty(
        'baseURL',
        'https://api.genfeed.ai/v1/org/org-1/test',
      );
      expect(instance2).toHaveProperty(
        'baseURL',
        'https://api.genfeed.ai/v1/org/org-1/test',
      );
    });

    it('should create distinct multi-arg instances when the organization changes under the same token', () => {
      const instance1 = BaseService.getDataServiceInstance(
        MultiArgTestService,
        'token-1',
        'org-1',
      );
      const instance2 = BaseService.getDataServiceInstance(
        MultiArgTestService,
        'token-1',
        'org-2',
      );

      expect(instance1).not.toBe(instance2);
      expect(instance1).toHaveProperty(
        'baseURL',
        'https://api.genfeed.ai/v1/org/org-1/test',
      );
      expect(instance2).toHaveProperty(
        'baseURL',
        'https://api.genfeed.ai/v1/org/org-2/test',
      );
    });
  });

  describe('clearInstance', () => {
    it('should clear a specific subclass/token instance', () => {
      const original = BaseService.getDataServiceInstance(
        TestService,
        'token-1',
      );
      TestService.clearInstance('token-1');
      const next = BaseService.getDataServiceInstance(TestService, 'token-1');

      expect(next).toBeInstanceOf(TestService);
      expect(next).not.toBe(original);
    });
  });

  describe('findAll', () => {
    it('should call GET with correct params', async () => {
      const mockResponse = {
        data: { data: [{ id: '1', name: 'Test' }] },
      };

      service.getInstanceForTest().get.mockResolvedValue(mockResponse);

      const result = await service.findAll({ page: 1 });

      expect(service.getInstanceForTest().get).toHaveBeenCalledWith('', {
        params: { page: 1 },
      });
      expect(result).toBeInstanceOf(Array);
    });

    it('should set pagination when page is provided', async () => {
      const mockResponse = {
        data: {
          data: [{ id: '1', name: 'Test' }],
          links: {
            pagination: {
              page: 2,
              pages: 5,
              total: 50,
            },
          },
        },
      };

      service.getInstanceForTest().get.mockResolvedValue(mockResponse);

      await service.findAll({ page: 2 });

      expect(PagesService.setCurrentPage).toHaveBeenCalledWith(2);
      expect(PagesService.setTotalPages).toHaveBeenCalledWith(5);
      expect(PagesService.setTotalDocs).toHaveBeenCalledWith(50);
    });
  });

  describe('findAllPages', () => {
    // An `{ id }`-only object is a relationship reference to the JSON:API
    // extractor mock, so rows carry a second attribute to stay resources.
    function mockPages(pages: string[][]) {
      const get = service.getInstanceForTest().get;
      pages.forEach((ids) => {
        get.mockResolvedValueOnce({
          data: {
            data: ids.map((id) => ({ id, name: `row-${id}` })),
            links: { pagination: { pages: pages.length } },
          },
        });
      });
      return get;
    }

    it('walks every server page and returns the flattened rows', async () => {
      const get = mockPages([['1', '2'], ['3']]);

      const result = await service.findAllPages({ isActive: true });

      expect(get).toHaveBeenCalledTimes(2);
      expect(get).toHaveBeenNthCalledWith(1, '', {
        params: { isActive: true, limit: 100, page: 1 },
        signal: undefined,
      });
      expect(get).toHaveBeenNthCalledWith(2, '', {
        params: { isActive: true, limit: 100, page: 2 },
        signal: undefined,
      });
      expect(result.map((row) => row.id)).toEqual(['1', '2', '3']);
    });

    it('issues a single request when the collection fits one page', async () => {
      const get = mockPages([['1']]);

      const result = await service.findAllPages();

      expect(get).toHaveBeenCalledTimes(1);
      expect(result.map((row) => row.id)).toEqual(['1']);
    });

    it('forwards the AbortSignal to every page request', async () => {
      const get = mockPages([['1'], ['2']]);
      const controller = new AbortController();

      await service.findAllPages({}, controller.signal);

      expect(get).toHaveBeenNthCalledWith(1, '', {
        params: { limit: 100, page: 1 },
        signal: controller.signal,
      });
      expect(get).toHaveBeenNthCalledWith(2, '', {
        params: { limit: 100, page: 2 },
        signal: controller.signal,
      });
    });

    it('stops at the page ceiling and warns instead of walking forever', async () => {
      service.getInstanceForTest().get.mockResolvedValue({
        data: {
          data: [{ id: 'row', name: 'row' }],
          links: { pagination: { pages: 500 } },
        },
      });

      const result = await service.findAllPages();

      expect(service.getInstanceForTest().get).toHaveBeenCalledTimes(50);
      expect(result).toHaveLength(50);
      expect(logger.warn).toHaveBeenCalledWith(
        'Fetch-all stopped at the page ceiling',
        expect.objectContaining({ maxPages: 50, totalPages: 500 }),
      );
    });

    it('should throw on error', async () => {
      service
        .getInstanceForTest()
        .get.mockRejectedValue(new Error('Network error'));

      await expect(service.findAllPages()).rejects.toThrow();
    });
  });

  describe('post', () => {
    it('should remove id from body', async () => {
      const mockResponse = {
        data: { data: { id: '1', name: 'Created' } },
      };

      service.getInstanceForTest().post.mockResolvedValue(mockResponse);

      await service.post({ id: 'should-remove', name: 'New Item' });

      expect(service.getInstanceForTest().post).toHaveBeenCalledWith('', {
        name: 'New Item',
      });
    });
  });

  describe('patch', () => {
    it('should remove undefined values from body', async () => {
      const mockResponse = {
        data: { data: { id: '123', name: 'Updated' } },
      };

      service.getInstanceForTest().patch.mockResolvedValue(mockResponse);

      await service.patch('123', { description: undefined, name: 'Updated' });

      expect(service.getInstanceForTest().patch).toHaveBeenCalledWith('/123', {
        name: 'Updated',
      });
    });
  });

  describe('mapMany', () => {
    it('should map array of items to model instances', async () => {
      const document = {
        data: [
          { id: '1', name: 'Item 1' },
          { id: '2', name: 'Item 2' },
        ],
      };

      const result = await service.testMapMany(document);

      expect(result).toHaveLength(2);
      expect(result[0]).toBeInstanceOf(TestModel);
      expect(result[1]).toBeInstanceOf(TestModel);
    });
  });

  describe('mapOne', () => {
    it('should map single item to model instance', async () => {
      const document = {
        data: { id: '1', name: 'Single Item' },
      };

      const result = await service.testMapOne(document);

      expect(result).toBeInstanceOf(TestModel);
      expect(result.id).toBe('1');
      expect(result.name).toBe('Single Item');
    });
  });

  describe('error handling', () => {
    it('preserves silent request cancellations without logging or wrapping', async () => {
      const cancellation = { isCancelled: true, silent: true };
      service.getInstanceForTest().get.mockRejectedValue(cancellation);

      await expect(service.findAll()).rejects.toBe(cancellation);
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('converts a rejected object payload from findAll into one ServiceOperationError', async () => {
      service.getInstanceForTest().get.mockRejectedValue({
        errors: [
          {
            code: '500',
            detail: 'Unsorted shelf is temporarily unavailable',
            title: 'Ingredient query failed',
          },
        ],
      });

      await expect(service.findAll()).rejects.toMatchObject({
        category: 'Ingredient query failed',
        message: 'Unsorted shelf is temporarily unavailable',
        name: 'ServiceOperationError',
      });
      expect(logger.error).toHaveBeenCalledTimes(1);
    });

    it('should handle validation errors', async () => {
      const validationError = {
        message: 'Validation failed',
        response: {
          data: {
            errors: [{ field: 'name', message: 'Name is required' }],
          },
          status: 422,
        },
      };

      service.getInstanceForTest().post.mockRejectedValue(validationError);

      await expect(service.post({ name: '' })).rejects.toThrow();
    });

    it('should handle 500 errors', async () => {
      const serverError = {
        message: 'Internal server error',
        response: { status: 500 },
      };

      service.getInstanceForTest().get.mockRejectedValue(serverError);

      await expect(service.findAll()).rejects.toThrow();
    });
  });
});

describe('ServiceInstanceManager (implicit)', () => {
  afterEach(() => {
    BaseService.clearAllInstances();
  });

  it('should clear all instances globally', () => {
    TestService.getInstance('token-1');
    TestService.getInstance('token-2');

    BaseService.clearAllInstances();

    // After clearing, new calls should create new instances
    const newInstance = TestService.getInstance('token-1');
    expect(newInstance).toBeInstanceOf(TestService);
  });
});

// ---------------------------------------------------------------------------
// HTTPBaseService interceptor — signal merging regression tests
// These tests exercise the *real* HTTPBaseService (not the vi.mock above)
// by using vi.importActual so the interceptor logic is live.
// ---------------------------------------------------------------------------
describe('HTTPBaseService handleRequest signal merging', () => {
  it('uses the instance-level abort signal when no per-request signal is supplied', async () => {
    const { HTTPBaseService: RealHTTPBaseService } = await vi.importActual<
      typeof import('@services/core/interceptor.service')
    >('@services/core/interceptor.service');

    class ConcreteService extends RealHTTPBaseService {
      constructor() {
        super('https://api.example.com', 'test-token');
      }
    }

    const svc = new ConcreteService();
    const handleRequest = (svc as unknown as Record<string, unknown>)
      .handleRequest as (
      config: Record<string, unknown>,
    ) => Record<string, unknown>;

    const config: Record<string, unknown> = { headers: {} };
    const result = handleRequest.call(svc, config);

    // Signal must be set (the instance-level AbortController's signal)
    expect(result.signal).toBeDefined();
    expect(result.signal).toBeInstanceOf(AbortSignal);
  });

  it('composes the instance-level signal with a per-request signal so both can abort independently', async () => {
    const { HTTPBaseService: RealHTTPBaseService } = await vi.importActual<
      typeof import('@services/core/interceptor.service')
    >('@services/core/interceptor.service');

    class ConcreteService extends RealHTTPBaseService {
      constructor() {
        super('https://api.example.com', 'test-token');
      }

      public getAbortController(): AbortController | null {
        return (this as unknown as Record<string, unknown>)
          .abortController as AbortController | null;
      }
    }

    const svc = new ConcreteService();
    const handleRequest = (svc as unknown as Record<string, unknown>)
      .handleRequest as (
      config: Record<string, unknown>,
    ) => Record<string, unknown>;

    const callerController = new AbortController();
    const config: Record<string, unknown> = {
      headers: {},
      signal: callerController.signal,
    };

    const result = handleRequest.call(svc, config);

    // Result must be a signal (either original or composed)
    expect(result.signal).toBeDefined();
    expect(result.signal).toBeInstanceOf(AbortSignal);

    // Aborting the caller signal must abort the composed signal
    callerController.abort('caller cancelled');
    const composedSignal = result.signal as AbortSignal;
    expect(composedSignal.aborted).toBe(true);
  });
});

describe('BaseService response schemas', () => {
  it('rejects invalid single responses before model construction', async () => {
    const service = new TestService('token');
    service.setValidationSchema(z.object({ id: z.string().min(1) }));
    await expect(service.testMapOne({ data: { id: 42 } })).rejects.toThrow();
  });

  it('rejects an invalid collection member', async () => {
    const service = new TestService('token');
    service.setValidationSchema(z.object({ id: z.string().min(1) }));
    await expect(
      service.testMapMany({ data: [{ id: 'valid' }, { id: '' }] }),
    ).rejects.toThrow();
  });

  it('preserves fields outside the validation schema during model construction', async () => {
    const service = new TestService('token');
    service.setValidationSchema(z.object({ id: z.string() }));
    expect(
      await service.testMapOne({ data: { id: 'one', name: 'Unchanged' } }),
    ).toEqual(new TestModel({ id: 'one', name: 'Unchanged' }));
    expect(
      await service.testMapMany({ data: [{ id: 'two', name: 'Preserved' }] }),
    ).toEqual([new TestModel({ id: 'two', name: 'Preserved' })]);
  });
});
