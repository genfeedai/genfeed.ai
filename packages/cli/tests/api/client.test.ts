import { beforeEach, describe, expect, it, vi } from 'vitest';
import { del, get, patch, post, requireAuth } from '../../src/api/client';
import { ApiError, AuthError } from '../../src/utils/errors';

interface CapturedRequestContext {
  options: { headers?: unknown };
}

interface CapturedResponseErrorContext {
  response: { _data?: unknown; status: number };
}

interface CapturedClientOptions {
  baseURL?: string;
  onRequest?: (context: CapturedRequestContext) => Promise<void>;
  onResponseError?: (context: CapturedResponseErrorContext) => Promise<void>;
}

// Mock config store — use vi.hoisted so the mocks exist before vi.mock factories run
const { mockApiKey, mockApiUrl, mockFetch, createCalls } = vi.hoisted(() => ({
  createCalls: [] as unknown[],
  mockApiKey: vi.fn<[], string | undefined>(),
  mockApiUrl: vi.fn<[], string>(),
  mockFetch: vi.fn(),
}));

vi.mock('../../src/config/store', () => ({
  getApiKey: () => mockApiKey(),
  getApiUrl: () => mockApiUrl(),
}));

vi.mock('ofetch', () => ({
  ofetch: {
    create: (options: unknown) => {
      createCalls.push(options);
      return mockFetch;
    },
  },
}));

function lastClientOptions(): CapturedClientOptions {
  return createCalls.at(-1) as CapturedClientOptions;
}

describe('api/client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiUrl.mockReturnValue('https://api.genfeed.ai/v1');
    mockApiKey.mockReturnValue(undefined);
  });

  describe('requireAuth', () => {
    it('returns API key when set', async () => {
      mockApiKey.mockImplementation(() => 'valid-api-key');
      const key = await requireAuth();
      expect(key).toBe('valid-api-key');
    });

    it('throws AuthError when no API key', async () => {
      mockApiKey.mockImplementation(() => undefined);
      await expect(requireAuth()).rejects.toThrow(AuthError);
    });
  });

  describe('get', () => {
    it('makes GET request to path', async () => {
      mockFetch.mockResolvedValue({ data: 'test' });

      const result = await get('/test');

      expect(mockFetch).toHaveBeenCalledWith('/test', { method: 'GET' });
      expect(result).toEqual({ data: 'test' });
    });

    it('returns response data', async () => {
      mockFetch.mockResolvedValue({ users: [{ id: 1 }] });

      const result = await get<{ users: { id: number }[] }>('/users');

      expect(result.users).toHaveLength(1);
    });
  });

  describe('post', () => {
    it('makes POST request with body', async () => {
      mockFetch.mockResolvedValue({ id: 123 });

      const result = await post('/create', { name: 'test' });

      expect(mockFetch).toHaveBeenCalledWith('/create', {
        body: { name: 'test' },
        method: 'POST',
      });
      expect(result).toEqual({ id: 123 });
    });

    it('makes POST request without body', async () => {
      mockFetch.mockResolvedValue({ success: true });

      const result = await post('/trigger');

      expect(mockFetch).toHaveBeenCalledWith('/trigger', {
        body: undefined,
        method: 'POST',
      });
      expect(result).toEqual({ success: true });
    });
  });

  describe('patch', () => {
    it('makes PATCH request with body', async () => {
      mockFetch.mockResolvedValue({ id: 'entity-1' });

      const result = await patch('/entities/entity-1', { status: 'archived' });

      expect(mockFetch).toHaveBeenCalledWith('/entities/entity-1', {
        body: { status: 'archived' },
        method: 'PATCH',
      });
      expect(result).toEqual({ id: 'entity-1' });
    });
  });

  describe('del', () => {
    it('makes DELETE request to path', async () => {
      mockFetch.mockResolvedValue({ deleted: true });

      const result = await del('/entities/entity-1');

      expect(mockFetch).toHaveBeenCalledWith('/entities/entity-1', { method: 'DELETE' });
      expect(result).toEqual({ deleted: true });
    });
  });

  describe('client configuration', () => {
    it('uses the configured base URL', async () => {
      mockFetch.mockResolvedValue({});
      await get('/anything');

      expect(lastClientOptions().baseURL).toBe('https://api.genfeed.ai/v1');
    });

    it('attaches a bearer Authorization header when an API key is set', async () => {
      mockApiKey.mockReturnValue('secret-key');
      mockFetch.mockResolvedValue({});
      await get('/anything');

      const context: CapturedRequestContext = { options: { headers: {} } };
      await lastClientOptions().onRequest?.(context);

      const headers = context.options.headers as Headers;
      expect(headers.get('Authorization')).toBe('Bearer secret-key');
    });

    it('leaves headers untouched without an API key', async () => {
      mockApiKey.mockReturnValue(undefined);
      mockFetch.mockResolvedValue({});
      await get('/anything');

      const originalHeaders = {};
      const context: CapturedRequestContext = { options: { headers: originalHeaders } };
      await lastClientOptions().onRequest?.(context);

      expect(context.options.headers).toBe(originalHeaders);
    });

    it('throws AuthError with the server message on 401', async () => {
      mockFetch.mockResolvedValue({});
      await get('/anything');

      await expect(
        lastClientOptions().onResponseError?.({
          response: {
            _data: { error: 'Unauthorized', message: 'Token expired', statusCode: 401 },
            status: 401,
          },
        })
      ).rejects.toThrow(AuthError);
    });

    it('throws AuthError with a default message on a bodiless 401', async () => {
      mockFetch.mockResolvedValue({});
      await get('/anything');

      await expect(
        lastClientOptions().onResponseError?.({ response: { status: 401 } })
      ).rejects.toThrow('Invalid or expired API key');
    });

    it('throws ApiError with a scope suggestion on 403', async () => {
      mockFetch.mockResolvedValue({});
      await get('/anything');

      const rejection = lastClientOptions().onResponseError?.({ response: { status: 403 } });
      await expect(rejection).rejects.toThrow(ApiError);
      await expect(
        lastClientOptions().onResponseError?.({ response: { status: 403 } })
      ).rejects.toMatchObject({
        statusCode: 403,
        suggestion: 'Check your API key has the required scopes',
      });
    });

    it('throws ApiError with the status for other errors', async () => {
      mockFetch.mockResolvedValue({});
      await get('/anything');

      await expect(
        lastClientOptions().onResponseError?.({ response: { status: 500 } })
      ).rejects.toThrow('Request failed with status 500');
    });
  });
});
