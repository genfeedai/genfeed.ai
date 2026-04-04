import { Effect } from 'effect';
import { AgentApiDecodeError, AgentApiRequestError } from './agent-api-error';
import {
  type AgentApiConfig,
  AgentBaseApiService,
  runAgentApiEffect,
} from './agent-base-api.service';

// Concrete subclass to test the protected base methods
class TestApiService extends AgentBaseApiService {
  constructor(config: AgentApiConfig) {
    super(config);
  }

  public async getHeaders(): Promise<Record<string, string>> {
    return runAgentApiEffect(this.headersEffect());
  }

  public async callFetchJson<T>(
    url: string,
    init?: RequestInit,
    errorMessage?: string,
  ): Promise<T> {
    return runAgentApiEffect(this.fetchJsonEffect<T>(url, init, errorMessage));
  }

  public callFetchJsonEffect<T>(
    url: string,
    init?: RequestInit,
    errorMessage?: string,
  ) {
    return this.fetchJsonEffect<T>(url, init, errorMessage);
  }
}

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('AgentBaseApiService', () => {
  const baseConfig: AgentApiConfig = {
    baseUrl: 'https://api.genfeed.ai',
    getToken: vi.fn().mockResolvedValue('test-token'),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  describe('constructor', () => {
    it('should be defined', () => {
      const service = new TestApiService(baseConfig);
      expect(service).toBeDefined();
    });

    it('should store config', () => {
      const service = new TestApiService(baseConfig);
      expect((service as unknown as { config: AgentApiConfig }).config).toBe(
        baseConfig,
      );
    });
  });

  describe('headers()', () => {
    it('should include Authorization header when token is present', async () => {
      const service = new TestApiService({
        ...baseConfig,
        getToken: vi.fn().mockResolvedValue('my-token'),
      });
      const headers = await service.getHeaders();
      expect(headers.Authorization).toBe('Bearer my-token');
      expect(headers['Content-Type']).toBe('application/json');
    });

    it('should omit Authorization header when token is null', async () => {
      const service = new TestApiService({
        ...baseConfig,
        getToken: vi.fn().mockResolvedValue(null),
      });
      const headers = await service.getHeaders();
      expect(headers.Authorization).toBeUndefined();
      expect(headers['Content-Type']).toBe('application/json');
    });

    it('should call getToken to retrieve the current token', async () => {
      const getToken = vi.fn().mockResolvedValue('fresh-token');
      const service = new TestApiService({ ...baseConfig, getToken });
      await service.getHeaders();
      expect(getToken).toHaveBeenCalledOnce();
    });
  });

  describe('fetchJson()', () => {
    it('should call fetch with the correct URL and merged headers', async () => {
      const mockResponse = { id: '1', name: 'test' };
      mockFetch.mockResolvedValueOnce({
        json: vi.fn().mockResolvedValue(mockResponse),
        ok: true,
      });

      const service = new TestApiService(baseConfig);
      const result = await service.callFetchJson<{ id: string; name: string }>(
        'https://api.genfeed.ai/test',
      );

      expect(mockFetch).toHaveBeenCalledOnce();
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.genfeed.ai/test',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
            'Content-Type': 'application/json',
          }),
        }),
      );
      expect(result).toEqual(mockResponse);
    });

    it('should throw with default message when response is not ok', async () => {
      mockFetch.mockResolvedValueOnce({
        json: vi.fn().mockResolvedValue({ message: 'Not Found' }),
        ok: false,
        status: 404,
      });

      const service = new TestApiService(baseConfig);
      await expect(
        service.callFetchJson('https://api.genfeed.ai/missing'),
      ).rejects.toMatchObject({
        _tag: 'AgentApiRequestError',
        message: 'Request failed: 404 - Not Found',
        status: 404,
      });
    });

    it('should throw with custom error message when provided', async () => {
      mockFetch.mockResolvedValueOnce({
        json: vi.fn().mockResolvedValue({ message: 'Forbidden' }),
        ok: false,
        status: 403,
      });

      const service = new TestApiService(baseConfig);
      await expect(
        service.callFetchJson(
          'https://api.genfeed.ai/secret',
          undefined,
          'Access denied',
        ),
      ).rejects.toMatchObject({
        _tag: 'AgentApiRequestError',
        message: 'Access denied: 403 - Forbidden',
        status: 403,
      });
    });

    it('should extract error.detail from JSON API error format', async () => {
      mockFetch.mockResolvedValueOnce({
        json: vi.fn().mockResolvedValue({
          errors: [{ detail: 'Invalid field value' }],
        }),
        ok: false,
        status: 422,
      });

      const service = new TestApiService(baseConfig);
      await expect(
        service.callFetchJson('https://api.genfeed.ai/resource'),
      ).rejects.toMatchObject({
        _tag: 'AgentApiRequestError',
        detail: 'Invalid field value',
        message: 'Request failed: 422 - Invalid field value',
        status: 422,
      });
    });

    it('should handle array message field in error response', async () => {
      mockFetch.mockResolvedValueOnce({
        json: vi.fn().mockResolvedValue({
          message: ['field is required', 'field must be a string'],
        }),
        ok: false,
        status: 400,
      });

      const service = new TestApiService(baseConfig);
      await expect(
        service.callFetchJson('https://api.genfeed.ai/bad'),
      ).rejects.toMatchObject({
        _tag: 'AgentApiRequestError',
        detail: 'field is required, field must be a string',
        message:
          'Request failed: 400 - field is required, field must be a string',
        status: 400,
      });
    });

    it('should omit Content-Type when body is FormData', async () => {
      mockFetch.mockResolvedValueOnce({
        json: vi.fn().mockResolvedValue({ uploaded: true }),
        ok: true,
      });

      const formData = new FormData();
      formData.append('file', new Blob(['test']), 'test.txt');

      const service = new TestApiService(baseConfig);
      await service.callFetchJson('https://api.genfeed.ai/upload', {
        body: formData,
        method: 'POST',
      });

      const calledHeaders = mockFetch.mock.calls[0][1].headers as Record<
        string,
        string
      >;
      expect(calledHeaders['Content-Type']).toBeUndefined();
    });

    it('should merge custom headers with default headers', async () => {
      mockFetch.mockResolvedValueOnce({
        json: vi.fn().mockResolvedValue({}),
        ok: true,
      });

      const service = new TestApiService(baseConfig);
      await service.callFetchJson('https://api.genfeed.ai/test', {
        headers: { 'X-Custom-Header': 'custom-value' },
      });

      const calledHeaders = mockFetch.mock.calls[0][1].headers as Record<
        string,
        string
      >;
      expect(calledHeaders['X-Custom-Header']).toBe('custom-value');
      expect(calledHeaders.Authorization).toBe('Bearer test-token');
    });

    it('retries once with a fresh token when the backend reports token expiry', async () => {
      const getToken = vi
        .fn()
        .mockResolvedValueOnce('expired-token')
        .mockResolvedValueOnce('fresh-token');

      mockFetch
        .mockResolvedValueOnce({
          json: vi.fn().mockResolvedValue({
            errors: [{ detail: 'Token expired' }],
          }),
          ok: false,
          status: 401,
        })
        .mockResolvedValueOnce({
          json: vi.fn().mockResolvedValue({ ok: true }),
          ok: true,
        });

      const service = new TestApiService({ ...baseConfig, getToken });
      await expect(
        service.callFetchJson<{ ok: boolean }>('https://api.genfeed.ai/test'),
      ).resolves.toEqual({ ok: true });

      expect(getToken).toHaveBeenNthCalledWith(1, undefined);
      expect(getToken).toHaveBeenNthCalledWith(2, { forceRefresh: true });

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch.mock.calls[0]?.[1]).toEqual(
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer expired-token',
          }),
        }),
      );
      expect(mockFetch.mock.calls[1]?.[1]).toEqual(
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer fresh-token',
          }),
        }),
      );
    });

    it('does not retry unrelated 401 responses', async () => {
      const getToken = vi.fn().mockResolvedValue('same-token');

      mockFetch.mockResolvedValueOnce({
        json: vi.fn().mockResolvedValue({
          errors: [{ detail: 'Invalid token' }],
        }),
        ok: false,
        status: 401,
      });

      const service = new TestApiService({ ...baseConfig, getToken });
      await expect(
        service.callFetchJson('https://api.genfeed.ai/test'),
      ).rejects.toMatchObject({
        _tag: 'AgentApiRequestError',
        detail: 'Invalid token',
        message: 'Request failed: 401 - Invalid token',
        status: 401,
      });

      expect(getToken).toHaveBeenCalledOnce();
      expect(mockFetch).toHaveBeenCalledOnce();
    });

    it('exposes an Effect-native request path for incremental adoption', async () => {
      mockFetch.mockResolvedValueOnce({
        json: vi.fn().mockResolvedValue({ id: '1' }),
        ok: true,
      });

      const service = new TestApiService(baseConfig);
      const result = await Effect.runPromise(
        service.callFetchJsonEffect<{ id: string }>(
          'https://api.genfeed.ai/effect',
        ),
      );

      expect(result).toEqual({ id: '1' });
    });

    it('maps invalid success payloads to a typed decode error in the Effect path', async () => {
      mockFetch.mockResolvedValueOnce({
        json: vi.fn().mockRejectedValue(new Error('invalid json')),
        ok: true,
      });

      const service = new TestApiService(baseConfig);
      const error = await Effect.runPromise(
        Effect.flip(
          service.callFetchJsonEffect('https://api.genfeed.ai/bad-json'),
        ),
      );

      expect(error).toEqual(
        expect.objectContaining({
          _tag: 'AgentApiDecodeError',
          message: 'Failed to decode JSON response',
        } satisfies Partial<AgentApiDecodeError>),
      );
    });

    it('maps transport failures to a typed request error in the Effect path', async () => {
      mockFetch.mockRejectedValueOnce(new Error('network down'));

      const service = new TestApiService(baseConfig);
      const error = await Effect.runPromise(
        Effect.flip(
          service.callFetchJsonEffect('https://api.genfeed.ai/offline'),
        ),
      );

      expect(error).toEqual(
        expect.objectContaining({
          _tag: 'AgentApiRequestError',
          detail: 'network down',
          message: 'network down',
          status: 0,
        } satisfies Partial<AgentApiRequestError>),
      );
    });
  });
});
