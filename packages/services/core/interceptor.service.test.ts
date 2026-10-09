import { GENERATION_ENTRY_HEADER } from '@genfeedai/contracts/interfaces/content/generation-entry.interface';
import { getGenerationEntryHeaders } from '@services/core/generation-entry-headers';

vi.mock('@services/core/generation-entry-headers', () => ({
  getGenerationEntryHeaders: vi.fn(() => ({})),
}));

import {
  ORGANIZATION_CONTEXT_HEADER,
  UNATTRIBUTED_FORWARDED_HEADER,
  UNATTRIBUTED_FORWARDED_VALUE,
} from '@genfeedai/contracts/constants';
import type { IHttpRequestOptions } from '@genfeedai/contracts/interfaces/utils/http-request-options.interface';
import { EnvironmentService } from '@services/core/environment.service';
import {
  clearAllServiceInstances,
  clearRequestOrganizationId,
  HTTP_REQUEST_TIMEOUT_MS,
  HTTPBaseService,
  setRequestOrganizationId,
} from '@services/core/interceptor.service';
import axios, {
  type AxiosError,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios';
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
class TestHTTPService extends HTTPBaseService {
  requestForTest(config: AxiosRequestConfig & IHttpRequestOptions) {
    return this.instance.get('/test', config);
  }
}
class OtherTestHTTPService extends HTTPBaseService {}

function runRequestInterceptor(
  target: HTTPBaseService,
  config: InternalAxiosRequestConfig,
): InternalAxiosRequestConfig {
  const { handleRequest } = target as unknown as {
    handleRequest: (
      request: InternalAxiosRequestConfig,
    ) => InternalAxiosRequestConfig;
  };
  return handleRequest(config);
}
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
    clearRequestOrganizationId();

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

  it('sends the renderer entry header alongside existing authorization', () => {
    vi.mocked(getGenerationEntryHeaders).mockReturnValue({
      [GENERATION_ENTRY_HEADER]: 'desktop',
    });
    const result = runRequestInterceptor(service, {
      headers: {},
    } as InternalAxiosRequestConfig);
    expect(result.headers[GENERATION_ENTRY_HEADER]).toBe('desktop');
    expect(result.headers.Authorization).toBe(`Bearer ${mockToken}`);
    vi.mocked(getGenerationEntryHeaders).mockReturnValue({});
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
        timeout: HTTP_REQUEST_TIMEOUT_MS,
      });
    });

    it('bounds every request with the documented thirty-second timeout', () => {
      expect(HTTP_REQUEST_TIMEOUT_MS).toBe(30_000);
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

    it('carries the confirmed organization identity on authenticated requests', () => {
      const config: InternalAxiosRequestConfig = {
        headers: {},
      } as InternalAxiosRequestConfig;
      setRequestOrganizationId('org-confirmed');

      const result = service.handleRequest(config);

      expect(result.headers['x-genfeed-organization-id']).toBe('org-confirmed');
    });

    it('omits organization identity while route reconciliation is unresolved', () => {
      const config: InternalAxiosRequestConfig = {
        headers: {},
      } as InternalAxiosRequestConfig;
      clearRequestOrganizationId();

      const result = service.handleRequest(config);

      expect(result.headers['x-genfeed-organization-id']).toBeUndefined();
    });

    it('declares the visitor unknown on server-side requests', () => {
      const config: InternalAxiosRequestConfig = {
        headers: {},
      } as InternalAxiosRequestConfig;

      const result = runRequestInterceptor(service, config);

      expect(result.headers[UNATTRIBUTED_FORWARDED_HEADER]).toBe(
        UNATTRIBUTED_FORWARDED_VALUE,
      );
    });

    it('leaves browser requests unmarked', () => {
      vi.stubGlobal('window', {});
      try {
        const config: InternalAxiosRequestConfig = {
          headers: {},
        } as InternalAxiosRequestConfig;

        const result = runRequestInterceptor(service, config);

        expect(result.headers[UNATTRIBUTED_FORWARDED_HEADER]).toBeUndefined();
      } finally {
        vi.unstubAllGlobals();
      }
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

      const rejection = service.handleError(error as AxiosError);
      // Must be a real Error (a thrown plain object surfaces in Sentry as an
      // unreadable JSON-serialized unhandledrejection title) and must not
      // leak response data.
      await expect(rejection).rejects.toBeInstanceOf(Error);
      await expect(rejection).rejects.toMatchObject({
        message: 'Request failed with status 500 (Internal Server Error)',
        status: 500,
      });
      await expect(rejection).rejects.not.toHaveProperty('sensitive');
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

    it('does not open the Error Debug modal for expected 404s', async () => {
      const { openModal } = await import(
        '@genfeedai/helpers/ui/modal/modal.helper'
      );
      // Modal branch needs a browser `window` and a boolean isProduction flag
      // (mock is otherwise a vi.fn which is always truthy as a property).
      const previousWindow = (globalThis as { window?: unknown }).window;
      (globalThis as { window?: unknown }).window = {};
      Object.defineProperty(EnvironmentService, 'isProduction', {
        configurable: true,
        value: false,
      });

      try {
        const error: Partial<AxiosError> = {
          code: 'ERR_BAD_REQUEST',
          config: {
            baseURL: mockBaseURL,
            method: 'GET',
            url: '/editor-projects/missing',
          } as InternalAxiosRequestConfig,
          isAxiosError: true,
          message: 'Request failed with status code 404',
          name: 'AxiosError',
          response: {
            config: {} as InternalAxiosRequestConfig,
            data: {
              errors: [
                {
                  code: '404',
                  detail: "Editor project missing doesn't exist",
                  title: 'Editor project not found',
                },
              ],
            },
            headers: {},
            status: 404,
            statusText: 'Not Found',
          },
          toJSON: () => ({}),
        };

        try {
          await service.handleError(error as AxiosError);
        } catch (_e) {
          // Expected to throw
        }

        expect(openModal).not.toHaveBeenCalled();
      } finally {
        if (previousWindow === undefined) {
          delete (globalThis as { window?: unknown }).window;
        } else {
          (globalThis as { window?: unknown }).window = previousWindow;
        }
      }
    });

    it('opens the Error Debug modal for unexpected 5xx responses', async () => {
      const { openModal } = await import(
        '@genfeedai/helpers/ui/modal/modal.helper'
      );
      const { ModalEnum } = await import('@genfeedai/contracts');
      const previousWindow = (globalThis as { window?: unknown }).window;
      (globalThis as { window?: unknown }).window = {};
      Object.defineProperty(EnvironmentService, 'isProduction', {
        configurable: true,
        value: false,
      });

      try {
        const error: Partial<AxiosError> = {
          code: 'ERR_BAD_RESPONSE',
          config: {
            baseURL: mockBaseURL,
            method: 'GET',
            url: '/editor-projects/x',
          } as InternalAxiosRequestConfig,
          isAxiosError: true,
          message: 'Request failed with status code 500',
          name: 'AxiosError',
          response: {
            config: {} as InternalAxiosRequestConfig,
            data: { message: 'boom' },
            headers: {},
            status: 500,
            statusText: 'Internal Server Error',
          },
          toJSON: () => ({}),
        };

        try {
          await service.handleError(error as AxiosError);
        } catch (_e) {
          // Expected to throw
        }

        expect(openModal).toHaveBeenCalledWith(ModalEnum.ERROR_DEBUG);
      } finally {
        if (previousWindow === undefined) {
          delete (globalThis as { window?: unknown }).window;
        } else {
          (globalThis as { window?: unknown }).window = previousWindow;
        }
      }
    });
  });

  describe('request-local handled HTTP statuses in the browser', () => {
    let productionDescriptor: PropertyDescriptor | undefined;
    beforeEach(() => {
      productionDescriptor = Object.getOwnPropertyDescriptor(
        EnvironmentService,
        'isProduction',
      );
      Object.defineProperty(EnvironmentService, 'isProduction', {
        configurable: true,
        value: false,
      });
      vi.stubGlobal('window', {});
    });
    afterEach(() => {
      if (productionDescriptor)
        Object.defineProperty(
          EnvironmentService,
          'isProduction',
          productionDescriptor,
        );
      vi.unstubAllGlobals();
    });

    it.each([
      { status: 503, handledErrorStatuses: [503], opens: false },
      ...[401, 403, 404, 422].map((status) => ({
        status,
        handledErrorStatuses: undefined,
        opens: false,
      })),
      {
        status: 505,
        handledErrorStatuses: [408, 429, 500, 502, 503, 504],
        opens: true,
      },
      { status: 500, handledErrorStatuses: undefined, opens: true },
      { status: 503, handledErrorStatuses: undefined, opens: true },
      { status: 503, handledErrorStatuses: [], opens: true },
      {
        status: 409,
        handledErrorStatuses: [408, 429, 500, 502, 503, 504],
        opens: true,
      },
      {
        status: 501,
        handledErrorStatuses: [408, 429, 500, 502, 503, 504],
        opens: true,
      },
    ])(
      'status $status allowlist $handledErrorStatuses keeps rejection/debug and modal=$opens',
      async ({ status, handledErrorStatuses, opens }) => {
        const { openModal } = await import(
          '@genfeedai/helpers/ui/modal/modal.helper'
        );
        const { ModalEnum } = await import('@genfeedai/contracts');
        const { setErrorDebugInfo } = await import(
          '@services/core/error-debug-store'
        );
        const config = {
          headers: {},
          url: '/test',
          handledErrorStatuses,
        } as unknown as InternalAxiosRequestConfig & IHttpRequestOptions;
        const data = {
          errors: [{ status: String(status), detail: 'Unavailable' }],
        };
        const error = {
          config,
          message: 'Request failed',
          response: {
            config,
            data,
            headers: {},
            status,
            statusText: 'Unavailable',
          },
        } as AxiosError;
        if (status === 401)
          await expect(service.handleError(error)).rejects.toMatchObject({
            isAuthError: true,
          });
        else await expect(service.handleError(error)).rejects.toBe(data);
        expect(setErrorDebugInfo).toHaveBeenCalledWith(
          expect.objectContaining({ status, url: '/test', response: { data } }),
        );
        if (opens)
          expect(openModal).toHaveBeenCalledWith(ModalEnum.ERROR_DEBUG);
        else expect(openModal).not.toHaveBeenCalled();
      },
    );

    it.each([true, false, undefined, 1, 'true', {}])(
      'only literal true from a response predicate suppresses the modal (%s)',
      async (value) => {
        const { openModal } = await import(
          '@genfeedai/helpers/ui/modal/modal.helper'
        );
        const { setErrorDebugInfo } = await import(
          '@services/core/error-debug-store'
        );
        const predicate = vi.fn(() => value);
        const config = {
          url: '/test',
          headers: {},
          handlesErrorResponse: predicate,
        } as unknown as InternalAxiosRequestConfig & IHttpRequestOptions;
        const data = {
          errors: [{ status: '409', detail: 'Conflict fixture' }],
        };
        const error = {
          config,
          message: 'Request failed',
          response: { status: 409, data },
        } as AxiosError;
        await expect(service.handleError(error)).rejects.toBe(data);
        expect(predicate).toHaveBeenCalledOnce();
        expect(predicate).toHaveBeenCalledWith({ status: 409, data });
        expect(setErrorDebugInfo).toHaveBeenCalledWith(
          expect.objectContaining({ response: { data }, status: 409 }),
        );
        expect(openModal).toHaveBeenCalledTimes(value === true ? 0 : 1);
      },
    );
    it.each([undefined, null, 'malformed', 42, {}])(
      'fails closed for a missing/nonfunction response policy (%s)',
      async (policy) => {
        const { openModal } = await import(
          '@genfeedai/helpers/ui/modal/modal.helper'
        );
        const data = { errors: [{ detail: 'Conflict fixture' }] };
        const config = {
          headers: {},
          handlesErrorResponse: policy,
        } as unknown as InternalAxiosRequestConfig & IHttpRequestOptions;
        const error = {
          config,
          message: 'Request failed',
          response: { status: 409, data },
        } as AxiosError;
        await expect(service.handleError(error)).rejects.toBe(data);
        expect(openModal).toHaveBeenCalledOnce();
      },
    );
    it('contains a throwing presentation predicate without replacing rejection or debug capture', async () => {
      const { openModal } = await import(
        '@genfeedai/helpers/ui/modal/modal.helper'
      );
      const { setErrorDebugInfo } = await import(
        '@services/core/error-debug-store'
      );
      const data = { errors: [{ detail: 'Original failure' }] };
      const config = {
        headers: {},
        handlesErrorResponse: () => {
          throw new Error('policy failed');
        },
      } as unknown as InternalAxiosRequestConfig & IHttpRequestOptions;
      await expect(
        service.handleError({
          config,
          message: 'Request failed',
          response: { status: 409, data },
        } as AxiosError),
      ).rejects.toBe(data);
      expect(openModal).toHaveBeenCalledOnce();
      expect(setErrorDebugInfo).toHaveBeenCalledWith(
        expect.objectContaining({ response: { data } }),
      );
    });
    it('retains handled-status policy when the response predicate rejects the presentation exemption', async () => {
      const { openModal } = await import(
        '@genfeedai/helpers/ui/modal/modal.helper'
      );
      const data = { errors: [{ detail: 'Unavailable' }] };
      const config = {
        headers: {},
        handledErrorStatuses: [503],
        handlesErrorResponse: () => false,
      } as unknown as InternalAxiosRequestConfig & IHttpRequestOptions;
      await expect(
        service.handleError({
          config,
          message: 'Request failed',
          response: { status: 503, data },
        } as AxiosError),
      ).rejects.toBe(data);
      expect(openModal).not.toHaveBeenCalled();
    });
    it('cancels before invoking policy, capturing debug data or opening a modal', async () => {
      const { openModal } = await import(
        '@genfeedai/helpers/ui/modal/modal.helper'
      );
      const { setErrorDebugInfo } = await import(
        '@services/core/error-debug-store'
      );
      const predicate = vi.fn(() => true);
      const config = {
        handlesErrorResponse: predicate,
      } as unknown as InternalAxiosRequestConfig & IHttpRequestOptions;
      await expect(
        service.handleError({
          code: 'ERR_CANCELED',
          config,
          message: 'canceled',
        } as AxiosError),
      ).rejects.toEqual({ isCancelled: true, silent: true });
      expect(predicate).not.toHaveBeenCalled();
      expect(setErrorDebugInfo).not.toHaveBeenCalled();
      expect(openModal).not.toHaveBeenCalled();
    });
    it.each([undefined, '409', Number.NaN, Number.POSITIVE_INFINITY])(
      'does not invoke response policy for an unknown HTTP status (%s)',
      async (status) => {
        const predicate = vi.fn(() => true);
        const data = { errors: [{ detail: 'Original failure' }] };
        const config = {
          handlesErrorResponse: predicate,
        } as unknown as InternalAxiosRequestConfig & IHttpRequestOptions;
        await expect(
          service.handleError({
            config,
            message: 'Request failed',
            response: { status, data },
          } as unknown as AxiosError),
        ).rejects.toBe(data);
        expect(predicate).not.toHaveBeenCalled();
      },
    );
    it.each([true, false])(
      'keeps production safe pass-through/sanitization equivalent (safe=%s)',
      async (safe) => {
        const { openModal } = await import(
          '@genfeedai/helpers/ui/modal/modal.helper'
        );
        const { setErrorDebugInfo } = await import(
          '@services/core/error-debug-store'
        );
        Object.defineProperty(EnvironmentService, 'isProduction', {
          configurable: true,
          value: true,
        });
        const predicate = vi.fn(() => true);
        const data = {
          errors: [
            {
              status: '409',
              detail: safe
                ? 'Safe conflict'
                : 'Internal stack\nprivate diagnostic',
            },
          ],
        };
        const config = {
          handlesErrorResponse: predicate,
        } as unknown as InternalAxiosRequestConfig & IHttpRequestOptions;
        const error = {
          config,
          message: 'Request failed',
          response: { status: 409, statusText: 'Conflict', data },
        } as AxiosError;
        if (safe) await expect(service.handleError(error)).rejects.toBe(data);
        else
          await expect(service.handleError(error)).rejects.toMatchObject({
            message: 'Request failed with status 409 (Conflict)',
            status: 409,
            statusText: 'Conflict',
          });
        expect(predicate).not.toHaveBeenCalled();
        expect(openModal).not.toHaveBeenCalled();
        expect(setErrorDebugInfo).toHaveBeenCalledWith(
          expect.objectContaining({ response: { data } }),
        );
      },
    );
    it('keeps auth rejection under a response presentation policy', async () => {
      const data = { errors: [{ detail: 'Unauthorized' }] };
      const config = {
        handlesErrorResponse: () => true,
      } as unknown as InternalAxiosRequestConfig & IHttpRequestOptions;
      await expect(
        service.handleError({
          config,
          message: 'Request failed',
          response: { status: 401, data },
        } as AxiosError),
      ).rejects.toMatchObject({ isAuthError: true });
    });
    it('preserves predicate metadata through real Axios merging without request/default leakage', async () => {
      const realAxios = await vi.importActual<typeof import('axios')>('axios');
      const { openModal } = await import(
        '@genfeedai/helpers/ui/modal/modal.helper'
      );
      const { setErrorDebugInfo } = await import(
        '@services/core/error-debug-store'
      );
      const mockedFactory = vi.mocked(axios.create).getMockImplementation();
      const configs: Array<InternalAxiosRequestConfig & IHttpRequestOptions> =
        [];
      const data = { errors: [{ status: '409', detail: 'Conflict fixture' }] };
      vi.mocked(axios.create).mockImplementation((config) =>
        realAxios.default.create({
          ...config,
          adapter: async (request) => {
            configs.push(request);
            throw new realAxios.AxiosError(
              'Request failed',
              'ERR_BAD_RESPONSE',
              request,
              undefined,
              {
                config: request,
                data,
                headers: {},
                status: 409,
                statusText: 'Conflict',
              },
            );
          },
        }),
      );
      try {
        setRequestOrganizationId('org-policy');
        const realService = new TestHTTPService(mockBaseURL, mockToken);
        const predicate = vi.fn(() => true);
        const signal = new AbortController().signal;
        const params = { revision: 2 };
        await expect(
          realService.requestForTest({
            handlesErrorResponse: predicate,
            params,
            signal,
            headers: { 'X-Fixture': 'preserved' },
          }),
        ).rejects.toBe(data);
        expect(openModal).not.toHaveBeenCalled();
        await expect(realService.requestForTest({})).rejects.toBe(data);
        expect(openModal).toHaveBeenCalledOnce();
        expect(setErrorDebugInfo).toHaveBeenCalledTimes(2);
        expect(configs[0]?.handlesErrorResponse).toBe(predicate);
        expect(configs[1]?.handlesErrorResponse).toBeUndefined();
        expect(configs[0]?.params).toEqual(params);
        expect(configs[0]?.data).toBeUndefined();
        expect(configs[0]?.headers).toMatchObject({
          Authorization: `Bearer ${mockToken}`,
          'X-Fixture': 'preserved',
          [ORGANIZATION_CONTEXT_HEADER]: 'org-policy',
        });
        expect(configs[0]?.headers).not.toHaveProperty('handlesErrorResponse');
        expect(configs[0]?.params).not.toHaveProperty('handlesErrorResponse');
        expect(configs[0]?.timeout).toBe(HTTP_REQUEST_TIMEOUT_MS);
        expect(configs[0]?.signal).not.toBe(signal);
        expect(configs[0]?.signal?.aborted).toBe(false);
      } finally {
        if (mockedFactory)
          vi.mocked(axios.create).mockImplementation(mockedFactory);
      }
    });

    it('preserves custom config through real Axios merging without leaking it between requests', async () => {
      const realAxios = await vi.importActual<typeof import('axios')>('axios');
      const { openModal } = await import(
        '@genfeedai/helpers/ui/modal/modal.helper'
      );
      const { setErrorDebugInfo } = await import(
        '@services/core/error-debug-store'
      );
      const mockedFactory = vi.mocked(axios.create).getMockImplementation();
      const configs: Array<InternalAxiosRequestConfig & IHttpRequestOptions> =
        [];
      const data = { errors: [{ status: '503', detail: 'Unavailable' }] };
      vi.mocked(axios.create).mockImplementation((config) =>
        realAxios.default.create({
          ...config,
          adapter: async (request) => {
            configs.push(request);
            throw new realAxios.AxiosError(
              'Request failed',
              'ERR_BAD_RESPONSE',
              request,
              undefined,
              {
                config: request,
                data,
                headers: {},
                status: 503,
                statusText: 'Unavailable',
              },
            );
          },
        }),
      );
      try {
        const realService = new TestHTTPService(mockBaseURL, mockToken);
        await expect(
          realService.requestForTest({ handledErrorStatuses: [503] }),
        ).rejects.toBe(data);
        expect(openModal).not.toHaveBeenCalled();
        await expect(realService.requestForTest({})).rejects.toBe(data);
        expect(openModal).toHaveBeenCalledTimes(1);
        expect(setErrorDebugInfo).toHaveBeenCalledTimes(2);
        expect(configs[0].handledErrorStatuses).toEqual([503]);
        expect(configs[1].handledErrorStatuses).toBeUndefined();
        expect(configs[0].params).toBeUndefined();
        expect(configs[0].headers).not.toHaveProperty('handledErrorStatuses');
      } finally {
        if (mockedFactory)
          vi.mocked(axios.create).mockImplementation(mockedFactory);
      }
    });
  });

  it.each(['safe detail', 'long '.repeat(50), 'multiline\ndetail'])(
    'retains only bounded IDs through production handling for %j',
    async (detail) => {
      const descriptor = Object.getOwnPropertyDescriptor(
        EnvironmentService,
        'isProduction',
      );
      Object.defineProperty(EnvironmentService, 'isProduction', {
        configurable: true,
        value: true,
      });
      const responseData = {
        errors: [
          {
            code: 'VIDEO_INPUT',
            status: '422',
            detail,
            meta: {
              persistedVideoIngredientIds: ['saved'],
              privateProvider: 'private',
            },
          },
        ],
      };
      const error = {
        response: {
          status: 422,
          statusText: 'Unprocessable Entity',
          data: responseData,
        },
        config: {},
      } as AxiosError;
      const target = service as unknown as {
        handleError: (error: AxiosError) => Promise<never>;
      };
      let caught: unknown;
      try {
        await target.handleError(error);
      } catch (value) {
        caught = value;
      }
      if (detail === 'safe detail') expect(caught).toBe(responseData);
      else {
        expect(caught).toBeInstanceOf(Error);
        expect(caught).toMatchObject({
          status: 422,
          persistedVideoIngredientIds: ['saved'],
        });
        expect(JSON.stringify(caught)).not.toContain('privateProvider');
        expect(JSON.stringify(caught)).not.toContain(detail);
      }
      if (descriptor)
        Object.defineProperty(EnvironmentService, 'isProduction', descriptor);
    },
  );
});
