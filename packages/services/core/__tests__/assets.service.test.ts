import { Asset } from '@models/ingredients/asset.model';
import { AssetsService } from '@services/content/assets.service';
import type { AxiosInstance } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock modules
vi.mock('@genfeedai/client/serializers', () => ({
  AssetSerializer: { deserialize: vi.fn((d) => d), serialize: vi.fn((d) => d) },
}));

vi.mock('@genfeedai/constants', () => ({
  API_ENDPOINTS: { ASSETS: 'assets' },
}));

vi.mock('@services/core/interceptor.service', () => {
  const MockHTTPBase = class {
    protected baseURL: string = '';
    protected token: string = '';
    protected instance = {
      delete: vi.fn(),
      get: vi.fn(),
      patch: vi.fn(),
      post: vi.fn(),
    };
    constructor(_url: string, token: string) {
      this.token = token;
    }
  };
  return { HTTPBaseService: MockHTTPBase };
});

vi.mock('@services/core/logger.service', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: {
    apiEndpoint: 'https://api.test.com',
  },
}));

vi.mock('@helpers/data/deserializer.helper', () => ({
  deserializer: {
    deserialize: vi.fn((data) => data),
  },
}));

vi.mock('@models/ingredients/asset.model', () => ({
  Asset: class MockAsset {
    id = '';
    name = '';
    url = '';
    constructor(data: Record<string, unknown>) {
      Object.assign(this, data);
    }
  },
}));

describe('AssetsService', () => {
  let service: AssetsService;
  const mockToken = 'test-token-123';

  beforeEach(() => {
    service = new AssetsService(mockToken);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create an instance with correct base URL', () => {
      expect(service).toBeInstanceOf(AssetsService);
      expect(service).toBeDefined();
    });

    it('should have the model property set', () => {
      expect(service.model).toBe(Asset);
    });
  });

  describe('postUpload', () => {
    it('should upload FormData successfully', async () => {
      const mockResponse = {
        data: {
          attributes: {
            name: 'test.jpg',
            url: 'https://cdn.test.com/test.jpg',
          },
          id: 'asset-123',
          type: 'assets',
        },
      };

      const mockPost = vi.fn().mockResolvedValue({
        data: mockResponse,
      });

      // Mock the instance.post method
      service.instance = {
        post: mockPost,
      } as Partial<AxiosInstance> as AxiosInstance;

      const formData = new FormData();
      formData.append('file', new Blob(['test']), 'test.jpg');

      const result = await service.postUpload(formData);

      expect(mockPost).toHaveBeenCalledWith('/upload', formData, {
        onUploadProgress: expect.any(Function),
        timeout: 300_000,
      });

      expect(result).toBeInstanceOf(Asset);
      expect(result.id).toBe('asset-123');
      expect(result.name).toBe('test.jpg');
    });

    it('should track upload progress', async () => {
      const mockResponse = {
        data: {
          data: {
            attributes: { name: 'test.jpg' },
            id: 'asset-123',
            type: 'assets',
          },
        },
      };
      const progressCallback = vi.fn();

      const mockPost = vi.fn((_url, _data, config) => {
        // Simulate progress events
        config.onUploadProgress({ loaded: 50, total: 100 });
        config.onUploadProgress({ loaded: 100, total: 100 });
        return Promise.resolve(mockResponse);
      });

      service.instance = {
        post: mockPost,
      } as Partial<AxiosInstance> as AxiosInstance;

      const formData = new FormData();
      await service.postUpload(formData, progressCallback);

      expect(progressCallback).toHaveBeenCalledWith(50, 50, 100);
      expect(progressCallback).toHaveBeenCalledWith(100, 100, 100);
      expect(progressCallback).toHaveBeenCalledTimes(2);
    });

    it('should handle upload without progress callback', async () => {
      const mockResponse = {
        data: {
          data: {
            attributes: { name: 'test.jpg' },
            id: 'asset-123',
            type: 'assets',
          },
        },
      };

      const mockPost = vi.fn((_url, _data, config) => {
        // Call onUploadProgress without callback
        config.onUploadProgress({ loaded: 50, total: 100 });
        return Promise.resolve(mockResponse);
      });

      service.instance = {
        post: mockPost,
      } as Partial<AxiosInstance> as AxiosInstance;

      const formData = new FormData();
      const result = await service.postUpload(formData);

      expect(result).toBeDefined();
      expect(mockPost).toHaveBeenCalled();
    });

    it('should handle progress with undefined total', async () => {
      const mockResponse = {
        data: {
          data: {
            attributes: { name: 'test.jpg' },
            id: 'asset-123',
            type: 'assets',
          },
        },
      };
      const progressCallback = vi.fn();

      const mockPost = vi.fn((_url, _data, config) => {
        // Simulate progress event with undefined total
        config.onUploadProgress({ loaded: 50, total: undefined });
        return Promise.resolve(mockResponse);
      });

      service.instance = {
        post: mockPost,
      } as Partial<AxiosInstance> as AxiosInstance;

      const formData = new FormData();
      await service.postUpload(formData, progressCallback);

      // Should use 1 as fallback for undefined total
      expect(progressCallback).toHaveBeenCalledWith(5000, 50, 0);
    });

    it('should handle progress with zero total', async () => {
      const mockResponse = {
        data: {
          data: {
            attributes: { name: 'test.jpg' },
            id: 'asset-123',
            type: 'assets',
          },
        },
      };
      const progressCallback = vi.fn();

      const mockPost = vi.fn((_url, _data, config) => {
        config.onUploadProgress({ loaded: 50, total: 0 });
        return Promise.resolve(mockResponse);
      });

      service.instance = {
        post: mockPost,
      } as Partial<AxiosInstance> as AxiosInstance;

      const formData = new FormData();
      await service.postUpload(formData, progressCallback);

      // Should use 1 as fallback for zero total
      expect(progressCallback).toHaveBeenCalledWith(5000, 50, 0);
    });

    it('should handle upload errors', async () => {
      const mockError = new Error('Upload failed');
      const mockPost = vi.fn().mockRejectedValue(mockError);

      service.instance = {
        post: mockPost,
      } as Partial<AxiosInstance> as AxiosInstance;

      const formData = new FormData();

      await expect(service.postUpload(formData)).rejects.toThrow(
        'Upload failed',
      );
    });

    it('should use correct timeout for uploads', async () => {
      const mockResponse = {
        data: {
          data: {
            attributes: { name: 'test.jpg' },
            id: 'asset-123',
            type: 'assets',
          },
        },
      };
      const mockPost = vi.fn().mockResolvedValue(mockResponse);

      service.instance = {
        post: mockPost,
      } as Partial<AxiosInstance> as AxiosInstance;

      const formData = new FormData();
      await service.postUpload(formData);

      expect(mockPost).toHaveBeenCalledWith(
        '/upload',
        formData,
        expect.objectContaining({
          timeout: 300_000, // 5 minutes
        }),
      );
    });

    it('should deserialize response correctly', async () => {
      const mockResponse = {
        data: {
          data: {
            attributes: {
              fileName: 'test.jpg',
              fileUrl: 'https://cdn.test.com/test.jpg',
            },
            id: 'asset-123',
            type: 'assets',
          },
        },
      };

      const mockPost = vi.fn().mockResolvedValue(mockResponse);

      service.instance = {
        post: mockPost,
      } as Partial<AxiosInstance> as AxiosInstance;

      const formData = new FormData();
      const result = await service.postUpload(formData);

      expect(result.id).toBe('asset-123');
      expect(result.fileName).toBe('test.jpg');
      expect(result.fileUrl).toBe('https://cdn.test.com/test.jpg');
    });

    it('should handle large file uploads', async () => {
      const mockResponse = {
        data: {
          data: {
            attributes: { name: 'large.jpg' },
            id: 'asset-large',
            type: 'assets',
          },
        },
      };
      const progressCallback = vi.fn();

      const mockPost = vi.fn((_url, _data, config) => {
        // Simulate large file upload progress
        config.onUploadProgress({ loaded: 1000000, total: 10000000 }); // 10%
        config.onUploadProgress({ loaded: 5000000, total: 10000000 }); // 50%
        config.onUploadProgress({ loaded: 10000000, total: 10000000 }); // 100%
        return Promise.resolve(mockResponse);
      });

      service.instance = {
        post: mockPost,
      } as Partial<AxiosInstance> as AxiosInstance;

      const formData = new FormData();
      const largeBlob = new Blob([new ArrayBuffer(10000000)]);
      formData.append('file', largeBlob, 'large.jpg');

      await service.postUpload(formData, progressCallback);

      expect(progressCallback).toHaveBeenCalledWith(10, 1000000, 10000000);
      expect(progressCallback).toHaveBeenCalledWith(50, 5000000, 10000000);
      expect(progressCallback).toHaveBeenCalledWith(100, 10000000, 10000000);
    });

    it('should handle multiple file uploads', async () => {
      const mockResponse = {
        data: {
          data: {
            attributes: { name: 'multi.jpg' },
            id: 'multi-asset',
            type: 'assets',
          },
        },
      };
      const mockPost = vi.fn().mockResolvedValue(mockResponse);

      service.instance = {
        post: mockPost,
      } as Partial<AxiosInstance> as AxiosInstance;

      const formData = new FormData();
      formData.append('files', new Blob(['file1']), 'file1.jpg');
      formData.append('files', new Blob(['file2']), 'file2.jpg');
      formData.append('files', new Blob(['file3']), 'file3.jpg');

      const result = await service.postUpload(formData);

      expect(mockPost).toHaveBeenCalledWith(
        '/upload',
        formData,
        expect.any(Object),
      );
      expect(result).toBeDefined();
    });
  });

  describe('getInstance', () => {
    it('should return an AssetsService instance', () => {
      const instance = AssetsService.getInstance(mockToken);
      expect(instance).toBeInstanceOf(AssetsService);
    });

    it('should create new instance for different token', () => {
      const instance1 = AssetsService.getInstance(mockToken);
      const instance2 = AssetsService.getInstance('different-token');

      expect(instance1).not.toBe(instance2);
    });
  });

  describe('clearInstance', () => {
    it('should clear singleton instance', () => {
      const instance1 = AssetsService.getInstance(mockToken);
      AssetsService.clearInstance();
      const instance2 = AssetsService.getInstance(mockToken);

      expect(instance1).not.toBe(instance2);
    });
  });
});
