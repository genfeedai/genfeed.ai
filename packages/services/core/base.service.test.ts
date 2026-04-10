import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies
vi.mock('@genfeedai/helpers/data/json-api/json-api.helper', () => ({
  deserializeCollection: vi.fn((doc) => doc.data || []),
  deserializeResource: vi.fn((doc) => doc.data || {}),
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

vi.mock('@genfeedai/utils/error/error-handler.util', () => ({
  ErrorHandler: {
    extractErrorDetails: vi.fn((error) => ({
      code: 'ERR_UNKNOWN',
      message: error?.message || 'Unknown error',
      status: 500,
      validationErrors: [],
    })),
  },
}));

vi.mock('@genfeedai/utils/validation/type-validator.util', () => ({
  TypeValidator: {
    assertType: vi.fn(),
    isArray: vi.fn((val) => Array.isArray(val)),
  },
}));

import type { IServiceSerializer } from '@genfeedai/interfaces/utils/error.interface';
import { PagesService } from '@services/content/pages.service';
// Import after mocks
import { BaseService } from '@services/core/base.service';

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

  // Expose protected methods for testing
  public testMapMany(document: unknown) {
    return this.mapMany(document as any);
  }

  public testMapOne(document: unknown) {
    return this.mapOne(document as any);
  }

  public testExtractResource<D>(document: unknown) {
    return this.extractResource<D>(document as any);
  }

  public testExtractCollection<D>(document: unknown) {
    return this.extractCollection<D>(document as any);
  }

  public getInstanceForTest() {
    return (this as any).instance;
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

  describe('constructor', () => {
    it('should construct with correct base URL', () => {
      expect((service as any).baseURL).toBe('https://api.genfeed.ai/v1/test');
    });

    it('should store model reference', () => {
      expect(service.model).toBe(TestModel);
    });
  });

  describe('getInstance', () => {
    it('should return a subclass instance from the shared factory path', () => {
      const instance = BaseService.getDataServiceInstance(
        TestService,
        'token-1',
      );
      expect(instance).toBeInstanceOf(TestService);
      expect((instance as any).baseURL).toBe('https://api.genfeed.ai/v1/test');
    });

    it('should reuse the same instance for the same subclass and token', () => {
      const instance1 = BaseService.getDataServiceInstance(
        TestService,
        'token-1',
      );
      const instance2 = BaseService.getDataServiceInstance(
        TestService,
        'token-1',
      );

      expect(instance1).toBe(instance2);
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
      expect((instance2 as any).baseURL).toBe(
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
      expect((instance1 as any).baseURL).toBe(
        'https://api.genfeed.ai/v1/org/org-1/test',
      );
      expect((instance2 as any).baseURL).toBe(
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
      expect((instance1 as any).baseURL).toBe(
        'https://api.genfeed.ai/v1/org/org-1/test',
      );
      expect((instance2 as any).baseURL).toBe(
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

    it('should handle clearing non-existent instance', () => {
      expect(() => TestService.clearInstance('non-existent')).not.toThrow();
    });

    it('should not clear a different subclass using the same token', () => {
      const other = BaseService.getDataServiceInstance(
        OtherTestService,
        'token-1',
      );

      TestService.clearInstance('token-1');

      const otherAgain = BaseService.getDataServiceInstance(
        OtherTestService,
        'token-1',
      );

      expect(otherAgain).toBe(other);
    });

    it('should clear cached multi-arg instances for a token', () => {
      const original = BaseService.getDataServiceInstance(
        MultiArgTestService,
        'token-1',
        'org-1',
      );

      MultiArgTestService.clearInstance('token-1');

      const next = BaseService.getDataServiceInstance(
        MultiArgTestService,
        'token-1',
        'org-1',
      );

      expect(next).not.toBe(original);
    });
  });

  describe('clearAllInstances', () => {
    it('should clear all instances', () => {
      BaseService.getDataServiceInstance(TestService, 'token-1');
      BaseService.getDataServiceInstance(TestService, 'token-2');

      BaseService.clearAllInstances();

      expect(() =>
        BaseService.getDataServiceInstance(TestService, 'token-1'),
      ).not.toThrow();
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

    it('should handle empty query', async () => {
      const mockResponse = {
        data: { data: [] },
      };

      service.getInstanceForTest().get.mockResolvedValue(mockResponse);

      await service.findAll();

      expect(service.getInstanceForTest().get).toHaveBeenCalledWith('', {
        params: {},
      });
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

    it('should not set pagination when no page in query', async () => {
      const mockResponse = {
        data: { data: [] },
      };

      service.getInstanceForTest().get.mockResolvedValue(mockResponse);

      await service.findAll();

      expect(PagesService.setCurrentPage).not.toHaveBeenCalled();
    });

    it('should throw on error', async () => {
      service
        .getInstanceForTest()
        .get.mockRejectedValue(new Error('Network error'));

      await expect(service.findAll()).rejects.toThrow();
    });
  });

  describe('findOne', () => {
    it('should call GET with correct ID', async () => {
      const mockResponse = {
        data: { data: { id: '123', name: 'Test' } },
      };

      service.getInstanceForTest().get.mockResolvedValue(mockResponse);

      await service.findOne('123');

      expect(service.getInstanceForTest().get).toHaveBeenCalledWith('/123', {
        params: {},
      });
    });

    it('should pass query params', async () => {
      const mockResponse = {
        data: { data: { id: '123', name: 'Test' } },
      };

      service.getInstanceForTest().get.mockResolvedValue(mockResponse);

      await service.findOne('123', { include: 'relations' });

      expect(service.getInstanceForTest().get).toHaveBeenCalledWith('/123', {
        params: { include: 'relations' },
      });
    });

    it('should return model instance', async () => {
      const mockResponse = {
        data: { data: { id: '123', name: 'Test' } },
      };

      service.getInstanceForTest().get.mockResolvedValue(mockResponse);

      const result = await service.findOne('123');

      expect(result).toBeInstanceOf(TestModel);
    });

    it('should throw on error', async () => {
      service
        .getInstanceForTest()
        .get.mockRejectedValue(new Error('Not found'));

      await expect(service.findOne('invalid')).rejects.toThrow();
    });
  });

  describe('post', () => {
    it('should call POST with body', async () => {
      const mockResponse = {
        data: { data: { id: '1', name: 'Created' } },
      };

      service.getInstanceForTest().post.mockResolvedValue(mockResponse);

      await service.post({ name: 'New Item' });

      expect(service.getInstanceForTest().post).toHaveBeenCalledWith('', {
        name: 'New Item',
      });
    });

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

    it('should remove undefined values from body', async () => {
      const mockResponse = {
        data: { data: { id: '1', name: 'Created' } },
      };

      service.getInstanceForTest().post.mockResolvedValue(mockResponse);

      await service.post({ description: undefined, name: 'New Item' });

      expect(service.getInstanceForTest().post).toHaveBeenCalledWith('', {
        name: 'New Item',
      });
    });

    it('should remove null values from body', async () => {
      const mockResponse = {
        data: { data: { id: '1', name: 'Created' } },
      };

      service.getInstanceForTest().post.mockResolvedValue(mockResponse);

      await service.post({ description: null, name: 'New Item' });

      expect(service.getInstanceForTest().post).toHaveBeenCalledWith('', {
        name: 'New Item',
      });
    });

    it('should post to custom endpoint', async () => {
      const mockResponse = {
        data: { data: { id: '1', name: 'Created' } },
      };

      service.getInstanceForTest().post.mockResolvedValue(mockResponse);

      await service.post('custom', { name: 'New Item' });

      expect(service.getInstanceForTest().post).toHaveBeenCalledWith(
        '/custom',
        {
          name: 'New Item',
        },
      );
    });

    it('should return model instance', async () => {
      const mockResponse = {
        data: { data: { id: '1', name: 'Created' } },
      };

      service.getInstanceForTest().post.mockResolvedValue(mockResponse);

      const result = await service.post({ name: 'New Item' });

      expect(result).toBeInstanceOf(TestModel);
    });

    it('should throw on error', async () => {
      service
        .getInstanceForTest()
        .post.mockRejectedValue(new Error('Validation error'));

      await expect(service.post({ name: 'Invalid' })).rejects.toThrow();
    });
  });

  describe('patch', () => {
    it('should call PATCH with ID and body', async () => {
      const mockResponse = {
        data: { data: { id: '123', name: 'Updated' } },
      };

      service.getInstanceForTest().patch.mockResolvedValue(mockResponse);

      await service.patch('123', { name: 'Updated Name' });

      expect(service.getInstanceForTest().patch).toHaveBeenCalledWith('/123', {
        name: 'Updated Name',
      });
    });

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

    it('should remove null values from body', async () => {
      const mockResponse = {
        data: { data: { id: '123', name: 'Updated' } },
      };

      service.getInstanceForTest().patch.mockResolvedValue(mockResponse);

      await service.patch('123', { description: null, name: 'Updated' });

      expect(service.getInstanceForTest().patch).toHaveBeenCalledWith('/123', {
        name: 'Updated',
      });
    });

    it('should return model instance', async () => {
      const mockResponse = {
        data: { data: { id: '123', name: 'Updated' } },
      };

      service.getInstanceForTest().patch.mockResolvedValue(mockResponse);

      const result = await service.patch('123', { name: 'Updated' });

      expect(result).toBeInstanceOf(TestModel);
    });

    it('should throw on error', async () => {
      service
        .getInstanceForTest()
        .patch.mockRejectedValue(new Error('Not found'));

      await expect(
        service.patch('invalid', { name: 'Update' }),
      ).rejects.toThrow();
    });
  });

  describe('delete', () => {
    it('should call DELETE with ID', async () => {
      const mockResponse = {
        data: { data: { id: '123', name: 'Deleted' } },
      };

      service.getInstanceForTest().delete.mockResolvedValue(mockResponse);

      await service.delete('123');

      expect(service.getInstanceForTest().delete).toHaveBeenCalledWith('/123');
    });

    it('should return model instance', async () => {
      const mockResponse = {
        data: { data: { id: '123', name: 'Deleted' } },
      };

      service.getInstanceForTest().delete.mockResolvedValue(mockResponse);

      const result = await service.delete('123');

      expect(result).toBeInstanceOf(TestModel);
    });

    it('should throw on error', async () => {
      service
        .getInstanceForTest()
        .delete.mockRejectedValue(new Error('Not found'));

      await expect(service.delete('invalid')).rejects.toThrow();
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

    it('should handle empty array', async () => {
      const document = { data: [] };

      const result = await service.testMapMany(document);

      expect(result).toHaveLength(0);
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

  describe('extractResource', () => {
    it('should extract resource from document', () => {
      const document = {
        data: { id: '1', name: 'Resource' },
      };

      const result = service.testExtractResource(document);

      expect(result).toBeDefined();
    });

    it('should normalize bare relationship linkage objects to string ids', () => {
      const document = {
        data: {
          brand: { id: 'brand-1' },
          nested: {
            organization: { id: 'org-1' },
          },
          relationIds: [{ id: 'rel-1' }, { id: 'rel-2' }],
        },
      };

      const result = service.testExtractResource<{
        brand: string;
        nested: { organization: string };
        relationIds: string[];
      }>(document);

      expect(result).toEqual({
        brand: 'brand-1',
        nested: { organization: 'org-1' },
        relationIds: ['rel-1', 'rel-2'],
      });
    });

    it('should preserve hydrated relationship objects', () => {
      const document = {
        data: {
          brand: {
            id: 'brand-1',
            label: 'Acme',
          },
        },
      };

      const result = service.testExtractResource<{
        brand: { id: string; label: string };
      }>(document);

      expect(result).toEqual({
        brand: {
          id: 'brand-1',
          label: 'Acme',
        },
      });
    });
  });

  describe('extractCollection', () => {
    it('should extract collection from document', () => {
      const document = {
        data: [{ id: '1' }, { id: '2' }],
      };

      const result = service.testExtractCollection(document);

      expect(result).toBeDefined();
    });

    it('should normalize relationship linkage objects inside collections', () => {
      const document = {
        data: [
          { organization: { id: 'org-1' } },
          { organization: { id: 'org-2' } },
        ],
      };

      const result = service.testExtractCollection<{
        organization: string;
      }>(document);

      expect(result).toEqual([
        { organization: 'org-1' },
        { organization: 'org-2' },
      ]);
    });
  });

  describe('error handling', () => {
    it('should handle network errors', async () => {
      service
        .getInstanceForTest()
        .get.mockRejectedValue(new Error('Network error'));

      await expect(service.findAll()).rejects.toThrow();
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

    it('should handle 404 errors', async () => {
      const notFoundError = {
        message: 'Not found',
        response: { status: 404 },
      };

      service.getInstanceForTest().get.mockRejectedValue(notFoundError);

      await expect(service.findOne('invalid-id')).rejects.toThrow();
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

  it('should manage multiple service types', () => {
    class ServiceA extends BaseService<TestModel> {
      constructor(token: string) {
        super('/a', token, TestModel, mockSerializer);
      }

      static override getInstance(token: string): ServiceA {
        return new ServiceA(token);
      }
    }

    class ServiceB extends BaseService<TestModel> {
      constructor(token: string) {
        super('/b', token, TestModel, mockSerializer);
      }

      static override getInstance(token: string): ServiceB {
        return new ServiceB(token);
      }
    }

    const instanceA = ServiceA.getInstance('token');
    const instanceB = ServiceB.getInstance('token');

    expect(instanceA).toBeInstanceOf(ServiceA);
    expect(instanceB).toBeInstanceOf(ServiceB);
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
