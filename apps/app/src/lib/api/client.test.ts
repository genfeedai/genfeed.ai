import { server } from '@/test/mocks/server';
import { HttpResponse, http } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ApiError, apiClient } from './client';

const API_BASE_URL = 'http://local.genfeed.ai:4001/api';

describe('apiClient', () => {
  const mockResponse = { data: 'test' };

  beforeEach(() => {
    // Reset any runtime handlers added in tests
  });

  afterEach(() => {
    server.resetHandlers();
  });

  describe('get', () => {
    it('should make GET request and return parsed JSON', async () => {
      server.use(
        http.get(`${API_BASE_URL}/test-endpoint`, () => {
          return HttpResponse.json(mockResponse);
        })
      );

      const result = await apiClient.get<typeof mockResponse>('/test-endpoint');

      expect(result).toEqual(mockResponse);
    });

    it('should handle abort signal', async () => {
      const controller = new AbortController();

      server.use(
        http.get(`${API_BASE_URL}/test`, async () => {
          // Simulate slow response
          await new Promise((resolve) => setTimeout(resolve, 100));
          return HttpResponse.json(mockResponse);
        })
      );

      // Abort immediately
      controller.abort();

      await expect(apiClient.get('/test', { signal: controller.signal })).rejects.toThrow();
    });
  });

  describe('post', () => {
    it('should make POST request with JSON body', async () => {
      const data = { name: 'test' };
      let receivedBody: unknown;

      server.use(
        http.post(`${API_BASE_URL}/test`, async ({ request }) => {
          receivedBody = await request.json();
          return HttpResponse.json(mockResponse);
        })
      );

      await apiClient.post('/test', data);

      expect(receivedBody).toEqual(data);
    });

    it('should handle undefined body', async () => {
      server.use(
        http.post(`${API_BASE_URL}/test`, () => {
          return HttpResponse.json(mockResponse);
        })
      );

      const result = await apiClient.post('/test', undefined);

      expect(result).toEqual(mockResponse);
    });
  });

  describe('put', () => {
    it('should make PUT request with JSON body', async () => {
      const data = { name: 'updated' };
      let receivedBody: unknown;

      server.use(
        http.put(`${API_BASE_URL}/test/123`, async ({ request }) => {
          receivedBody = await request.json();
          return HttpResponse.json(mockResponse);
        })
      );

      await apiClient.put('/test/123', data);

      expect(receivedBody).toEqual(data);
    });
  });

  describe('patch', () => {
    it('should make PATCH request with JSON body', async () => {
      const data = { status: 'active' };
      let receivedBody: unknown;

      server.use(
        http.patch(`${API_BASE_URL}/test/123`, async ({ request }) => {
          receivedBody = await request.json();
          return HttpResponse.json(mockResponse);
        })
      );

      await apiClient.patch('/test/123', data);

      expect(receivedBody).toEqual(data);
    });
  });

  describe('delete', () => {
    it('should make DELETE request', async () => {
      server.use(
        http.delete(`${API_BASE_URL}/test/123`, () => {
          return HttpResponse.json({});
        })
      );

      const result = await apiClient.delete('/test/123');

      expect(result).toEqual({});
    });
  });

  describe('error handling', () => {
    it('should throw ApiError on non-ok response', async () => {
      server.use(
        http.get(`${API_BASE_URL}/not-found`, () => {
          return HttpResponse.json({ message: 'Not found' }, { status: 404 });
        })
      );

      await expect(apiClient.get('/not-found')).rejects.toThrow(ApiError);
    });

    it('should include status code in ApiError', async () => {
      server.use(
        http.get(`${API_BASE_URL}/error`, () => {
          return HttpResponse.json({ message: 'Server error' }, { status: 500 });
        })
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
      server.use(
        http.post(`${API_BASE_URL}/test`, () => {
          return HttpResponse.json(
            {
              code: 'VALIDATION_ERROR',
              details: ['field required'],
              message: 'Validation failed',
            },
            { status: 400 }
          );
        })
      );

      try {
        await apiClient.post('/test', {});
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).data).toEqual(
          expect.objectContaining({
            code: 'VALIDATION_ERROR',
          })
        );
      }
    });
  });
});

describe('ApiError', () => {
  it('should have correct properties', () => {
    const error = new ApiError(404, 'Not found', { detail: 'Resource missing' });

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
