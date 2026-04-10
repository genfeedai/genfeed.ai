import { EnvironmentService } from '@services/core/environment.service';
import {
  clearAllServiceInstances,
  HTTPBaseService,
} from '@services/core/interceptor.service';
import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies
vi.mock('axios');
vi.mock('./environment.service', () => ({
  EnvironmentService: {
    apiEndpoint: 'https://api.test.com',
    isDevelopment: vi.fn(() => true),
    isProduction: vi.fn(() => false),
  },
}));
vi.mock('@genfeedai/helpers/ui/modal/modal.helper');
vi.mock('@services/core/error-debug-store', () => ({
  clearErrorDebugInfo: vi.fn(),
  getErrorDebugInfo: vi.fn(),
  setErrorDebugInfo: vi.fn(),
  subscribe: vi.fn(() => vi.fn()),
}));

// Create a concrete test class since HTTPBaseService is abstract
class TestHTTPService extends HTTPBaseService {}
class OtherTestHTTPService extends HTTPBaseService {}
class MultiArgHTTPService extends HTTPBaseService {
  public readonly organizationId: string;

  constructor(token: string, organizationId: string) {
    super(`https://api.test.com/organizations/${organizationId}`, token);
    this.organizationId = organizationId;
  }
}

describe('HTTPBaseService (InterceptorService)', () => {
  let service: TestHTTPService;
  const mockToken = 'test-token-123';
  const mockBaseURL = 'https://api.test.com';

  beforeEach(() => {
    vi.clearAllMocks();
    clearAllServiceInstances();

    // Mock axios.create to return a mock instance
    vi.mocked(axios.create).mockReturnValue({
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() },
      },
    } as unknown as ReturnType<typeof axios.create>);

    service = new TestHTTPService(mockBaseURL, mockToken);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('initializes with correct baseURL and token', () => {
      expect(service.baseURL).toBe(mockBaseURL);
      expect(service.token).toBe(mockToken);
    });

    it('creates axios instance with correct config', () => {
      expect(axios.create).toHaveBeenCalledWith({
        baseURL: mockBaseURL,
        paramsSerializer: expect.any(Function),
        timeout: 30_000,
      });
    });

    it('serializes array params as repeated query keys', () => {
      const axiosConfig = vi.mocked(axios.create).mock.calls[0]?.[0];
      const paramsSerializer = axiosConfig?.paramsSerializer;
      const params = new URLSearchParams(
        paramsSerializer?.({ page: 2, status: ['generated', 'processing'] }),
      );

      expect(params.getAll('status')).toEqual(['generated', 'processing']);
      expect(params.get('page')).toBe('2');
    });

    it('omits empty arrays while keeping scalar params unchanged', () => {
      const axiosConfig = vi.mocked(axios.create).mock.calls[0]?.[0];
      const paramsSerializer = axiosConfig?.paramsSerializer;

      expect(paramsSerializer?.({ page: 2, status: [] })).toBe('page=2');
    });

    it('initializes request and response interceptors', () => {
      const mockInstance = service.instance;
      expect(mockInstance.interceptors.request.use).toHaveBeenCalled();
      expect(mockInstance.interceptors.response.use).toHaveBeenCalled();
    });
  });

  describe('getInstance', () => {
    it('returns a subclass instance from the shared factory path', () => {
      const instance = HTTPBaseService.getBaseServiceInstance(
        TestHTTPService,
        mockBaseURL,
        mockToken,
      );

      expect(instance).toBeInstanceOf(TestHTTPService);
      expect(instance.baseURL).toBe(mockBaseURL);
    });

    it('reuses the same instance for the same subclass and token', () => {
      const first = HTTPBaseService.getBaseServiceInstance(
        TestHTTPService,
        mockBaseURL,
        mockToken,
      );
      const second = HTTPBaseService.getBaseServiceInstance(
        TestHTTPService,
        mockBaseURL,
        mockToken,
      );

      expect(first).toBe(second);
    });

    it('isolates caches across subclasses that share the same token', () => {
      const first = HTTPBaseService.getBaseServiceInstance(
        TestHTTPService,
        mockBaseURL,
        mockToken,
      );
      const second = HTTPBaseService.getBaseServiceInstance(
        OtherTestHTTPService,
        mockBaseURL,
        mockToken,
      );

      expect(first).toBeInstanceOf(TestHTTPService);
      expect(second).toBeInstanceOf(OtherTestHTTPService);
      expect(first).not.toBe(second);
    });

    it('creates distinct instances when a multi-arg service receives a new token for the same organization', () => {
      const first = HTTPBaseService.getBaseServiceInstance(
        MultiArgHTTPService,
        'token-a',
        'org-1',
      );
      const second = HTTPBaseService.getBaseServiceInstance(
        MultiArgHTTPService,
        'token-b',
        'org-1',
      );

      expect(first).not.toBe(second);
      expect(first.token).toBe('token-a');
      expect(second.token).toBe('token-b');
    });

    it('creates distinct instances when a multi-arg service switches organizations under the same token', () => {
      const first = HTTPBaseService.getBaseServiceInstance(
        MultiArgHTTPService,
        'token-a',
        'org-1',
      );
      const second = HTTPBaseService.getBaseServiceInstance(
        MultiArgHTTPService,
        'token-a',
        'org-2',
      );

      expect(first).not.toBe(second);
      expect(first.baseURL).toBe('https://api.test.com/organizations/org-1');
      expect(second.baseURL).toBe('https://api.test.com/organizations/org-2');
    });
  });

  describe('clearInstance', () => {
    it('clears only the targeted subclass/token instance', () => {
      const original = HTTPBaseService.getBaseServiceInstance(
        TestHTTPService,
        mockBaseURL,
        mockToken,
      );

      TestHTTPService.clearInstance(TestHTTPService, mockToken);

      const next = HTTPBaseService.getBaseServiceInstance(
        TestHTTPService,
        mockBaseURL,
        mockToken,
      );

      expect(next).not.toBe(original);
    });

    it('does not clear a different subclass using the same token', () => {
      const other = HTTPBaseService.getBaseServiceInstance(
        OtherTestHTTPService,
        mockBaseURL,
        mockToken,
      );

      TestHTTPService.clearInstance(TestHTTPService, mockToken);

      const otherAgain = HTTPBaseService.getBaseServiceInstance(
        OtherTestHTTPService,
        mockBaseURL,
        mockToken,
      );

      expect(otherAgain).toBe(other);
    });

    it('clears all cached variants for a multi-arg service token', () => {
      const original = HTTPBaseService.getBaseServiceInstance(
        MultiArgHTTPService,
        'token-a',
        'org-1',
      );

      MultiArgHTTPService.clearInstance(MultiArgHTTPService, 'token-a');

      const next = HTTPBaseService.getBaseServiceInstance(
        MultiArgHTTPService,
        'token-a',
        'org-1',
      );

      expect(next).not.toBe(original);
    });
  });

  describe('setToken', () => {
    it('updates the token', () => {
      const newToken = 'new-token-456';
      service.setToken(newToken);
      expect(service.token).toBe(newToken);
    });
  });

  describe('cancelPendingRequests', () => {
    it('cancels pending requests when controller exists', () => {
      const mockAbort = vi.fn();
      service.abortController = {
        abort: mockAbort,
      } as AbortController;

      service.cancelPendingRequests();

      expect(mockAbort).toHaveBeenCalledWith('Request cancelled');
      expect(service.abortController).toBeNull();
    });

    it('does nothing when no controller exists', () => {
      service.abortController = null;
      expect(() => service.cancelPendingRequests()).not.toThrow();
    });
  });

  describe('handleRequest interceptor', () => {
    it('adds authorization header with bearer token', () => {
      const config: InternalAxiosRequestConfig = {
        headers: {},
      } as InternalAxiosRequestConfig;

      const result = service.handleRequest(config);

      expect(result.headers.Authorization).toBe(`Bearer ${mockToken}`);
    });

    it('creates abort controller if not exists', () => {
      const config: InternalAxiosRequestConfig = {
        headers: {},
      } as InternalAxiosRequestConfig;

      service.abortController = null;
      service.handleRequest(config);

      expect(service.abortController).not.toBeNull();
    });

    it('adds abort signal to config', () => {
      const config: InternalAxiosRequestConfig = {
        headers: {},
      } as InternalAxiosRequestConfig;

      const result = service.handleRequest(config);

      expect(result.signal).toBeDefined();
    });
  });

  describe('handleError interceptor', () => {
    it('silently rejects cancelled requests', async () => {
      const error: Partial<AxiosError> = {
        code: 'ERR_CANCELED',
        config: {} as InternalAxiosRequestConfig,
        isAxiosError: true,
        message: 'canceled',
        name: 'AxiosError',
        toJSON: () => ({}),
      };

      await expect(service.handleError(error as AxiosError)).rejects.toEqual({
        isCancelled: true,
        silent: true,
      });
    });

    it('handles timeout errors', async () => {
      const error: Partial<AxiosError> = {
        code: 'ECONNABORTED',
        config: {} as InternalAxiosRequestConfig,
        isAxiosError: true,
        message: 'timeout of 30000ms exceeded',
        name: 'AxiosError',
        toJSON: () => ({}),
      };

      await expect(
        service.handleError(error as AxiosError),
      ).rejects.toMatchObject({
        isTimeout: true,
        message:
          'Request timed out. Please check your connection and try again.',
      });
    });

    it('handles network errors', async () => {
      const error: Partial<AxiosError> = {
        code: 'ERR_NETWORK',
        config: {} as InternalAxiosRequestConfig,
        isAxiosError: true,
        message: 'Network Error',
        name: 'AxiosError',
        toJSON: () => ({}),
      };

      await expect(
        service.handleError(error as AxiosError),
      ).rejects.toMatchObject({
        isNetworkError: true,
        message: 'Network error. Please check your connection and try again.',
      });
    });

    it('handles 401 unauthorized errors', async () => {
      const error: Partial<AxiosError> = {
        config: {} as InternalAxiosRequestConfig,
        isAxiosError: true,
        message: 'Request failed with status code 401',
        name: 'AxiosError',
        response: {
          config: {} as InternalAxiosRequestConfig,
          data: {},
          headers: {},
          status: 401,
          statusText: 'Unauthorized',
        },
        toJSON: () => ({}),
      };

      await expect(
        service.handleError(error as AxiosError),
      ).rejects.toMatchObject({
        isAuthError: true,
        message: 'Authentication failed. Please sign in again.',
      });
    });

    it('sanitizes errors in production', async () => {
      vi.mocked(EnvironmentService.isProduction).mockReturnValue(true);

      const error: Partial<AxiosError> = {
        config: {} as InternalAxiosRequestConfig,
        isAxiosError: true,
        message: 'Request failed with status code 500',
        name: 'AxiosError',
        response: {
          config: {} as InternalAxiosRequestConfig,
          data: { sensitive: 'data' },
          headers: {},
          status: 500,
          statusText: 'Internal Server Error',
        },
        toJSON: () => ({}),
      };

      await expect(
        service.handleError(error as AxiosError),
      ).rejects.toMatchObject({
        message: 'An error occurred',
        status: 500,
      });
    });

    it('preserves full error details in development', async () => {
      vi.mocked(EnvironmentService.isProduction).mockReturnValue(false);
      vi.mocked(EnvironmentService.isDevelopment).mockReturnValue(true);

      const errorData = { detail: 'Detailed error message' };
      const error: Partial<AxiosError> = {
        config: {} as InternalAxiosRequestConfig,
        isAxiosError: true,
        message: 'Request failed with status code 400',
        name: 'AxiosError',
        response: {
          config: {} as InternalAxiosRequestConfig,
          data: errorData,
          headers: {},
          status: 400,
          statusText: 'Bad Request',
        },
        toJSON: () => ({}),
      };

      // In development, the error is still sanitized but includes status info
      await expect(
        service.handleError(error as AxiosError),
      ).rejects.toMatchObject({
        status: 400,
        statusText: 'Bad Request',
      });
    });

    it('handles JSON API error format in production', async () => {
      vi.mocked(EnvironmentService.isProduction).mockReturnValue(true);

      const jsonApiError = {
        errors: [
          {
            detail: 'Validation failed',
            source: { pointer: '/data/attributes/email' },
            status: '400',
          },
        ],
      };

      const error: Partial<AxiosError> = {
        config: {} as InternalAxiosRequestConfig,
        isAxiosError: true,
        message: 'Request failed with status code 400',
        name: 'AxiosError',
        response: {
          config: {} as InternalAxiosRequestConfig,
          data: jsonApiError,
          headers: {},
          status: 400,
          statusText: 'Bad Request',
        },
        toJSON: () => ({}),
      };

      await expect(service.handleError(error as AxiosError)).rejects.toEqual(
        jsonApiError,
      );
    });

    it('stores debug info for all errors', async () => {
      const { setErrorDebugInfo } = await import(
        '@services/core/error-debug-store'
      );

      const error: Partial<AxiosError> = {
        code: 'ERR_BAD_REQUEST',
        config: {
          baseURL: mockBaseURL,
          method: 'GET',
          url: '/api/test',
        } as InternalAxiosRequestConfig,
        isAxiosError: true,
        message: 'Request failed with status code 404',
        name: 'AxiosError',
        response: {
          config: {} as InternalAxiosRequestConfig,
          data: {},
          headers: {},
          status: 404,
          statusText: 'Not Found',
        },
        stack: 'Error stack trace',
        toJSON: () => ({}),
      };

      try {
        await service.handleError(error as AxiosError);
      } catch (_e) {
        // Expected to throw
      }

      expect(setErrorDebugInfo).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Request failed with status code 404',
          method: 'GET',
          status: 404,
          url: '/api/test',
        }),
      );
    });
  });
});
