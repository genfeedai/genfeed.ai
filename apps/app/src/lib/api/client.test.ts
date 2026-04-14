import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiClient } from './client';

const API_BASE_URL = '/v1';
const fetchMock = vi.fn<typeof fetch>();

function createJsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      'Content-Type': 'application/json',
    },
    status: 200,
    ...init,
  });
}

describe('apiClient', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('get', () => {
    it('should make GET request and return parsed JSON', async () => {
      const mockResponse = { data: 'test' };
      fetchMock.mockResolvedValueOnce(createJsonResponse(mockResponse));

      const result = await apiClient.get<typeof mockResponse>('/test-endpoint');

      expect(fetchMock).toHaveBeenCalledWith(`${API_BASE_URL}/test-endpoint`, {
        headers: { 'Content-Type': 'application/json' },
        method: 'GET',
      });
      expect(result).toEqual(mockResponse);
    });

    it('should handle abort signal', async () => {
      const controller = new AbortController();
      controller.abort();

      fetchMock.mockRejectedValueOnce(new DOMException('Aborted', 'AbortError'));

      await expect(
        apiClient.get('/test', { signal: controller.signal }),
      ).rejects.toThrow();
    });
  });

  describe('post', () => {
    it('should make POST request with JSON body', async () => {
      const mockResponse = { data: 'test' };
      const data = { name: 'test' };
      fetchMock.mockResolvedValueOnce(createJsonResponse(mockResponse));

      await apiClient.post('/test', data);

      expect(fetchMock).toHaveBeenCalledWith(`${API_BASE_URL}/test`, {
        body: JSON.stringify(data),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });
    });

    it('should handle undefined body', async () => {
      const mockResponse = { data: 'test' };
      fetchMock.mockResolvedValueOnce(createJsonResponse(mockResponse));

      const result = await apiClient.post('/test', undefined);

      expect(fetchMock).toHaveBeenCalledWith(`${API_BASE_URL}/test`, {
        body: undefined,
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });
      expect(result).toEqual(mockResponse);
    });
  });

  describe('put', () => {
    it('should make PUT request with JSON body', async () => {
      const mockResponse = { data: 'test' };
      const data = { name: 'updated' };
      fetchMock.mockResolvedValueOnce(createJsonResponse(mockResponse));

      await apiClient.put('/test/123', data);

      expect(fetchMock).toHaveBeenCalledWith(`${API_BASE_URL}/test/123`, {
        body: JSON.stringify(data),
        headers: { 'Content-Type': 'application/json' },
        method: 'PUT',
      });
    });
  });

  describe('patch', () => {
    it('should make PATCH request with JSON body', async () => {
      const mockResponse = { data: 'test' };
      const data = { status: 'active' };
      fetchMock.mockResolvedValueOnce(createJsonResponse(mockResponse));

      await apiClient.patch('/test/123', data);

      expect(fetchMock).toHaveBeenCalledWith(`${API_BASE_URL}/test/123`, {
        body: JSON.stringify(data),
        headers: { 'Content-Type': 'application/json' },
        method: 'PATCH',
      });
    });
  });

  describe('delete', () => {
    it('should make DELETE request', async () => {
      fetchMock.mockResolvedValueOnce(createJsonResponse({}));

      const result = await apiClient.delete('/test/123');

      expect(fetchMock).toHaveBeenCalledWith(`${API_BASE_URL}/test/123`, {
        headers: { 'Content-Type': 'application/json' },
        method: 'DELETE',
      });
      expect(result).toEqual({});
    });
  });

  describe('error handling', () => {
    it('should throw ApiError on non-ok response', async () => {
      fetchMock.mockResolvedValueOnce(
        createJsonResponse({ message: 'Not found' }, { status: 404 }),
      );

      await expect(apiClient.get('/not-found')).rejects.toThrow(ApiError);
    });

    it('should include status code in ApiError', async () => {
      fetchMock.mockResolvedValueOnce(
        createJsonResponse({ message: 'Server error' }, { status: 500 }),
      );

      try {
        await apiClient.get('/error');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(500);
        expect((error as ApiError).message).toBe('Server error');
      }
    });

    it('should include error data in ApiError', async () => {
      fetchMock.mockResolvedValueOnce(
        createJsonResponse(
          {
            code: 'VALIDATION_ERROR',
            details: ['field required'],
            message: 'Validation failed',
          },
          { status: 400 },
        ),
      );

      try {
        await apiClient.post('/test', {});
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).data).toEqual(
          expect.objectContaining({
            code: 'VALIDATION_ERROR',
          }),
        );
      }
    });
  });
});

describe('ApiError', () => {
  it('should have correct properties', () => {
    const error = new ApiError(404, 'Not found', {
      detail: 'Resource missing',
    });

    expect(error.statusCode).toBe(404);
    expect(error.message).toBe('Not found');
    expect(error.data).toEqual({ detail: 'Resource missing' });
    expect(error.name).toBe('ApiError');
  });

  it('should be instanceof Error', () => {
    const error = new ApiError(500, 'Server error');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ApiError);
  });
});
