import { ORGANIZATION_CONTEXT_HEADER } from '@genfeedai/contracts/constants';
import {
  clearRequestOrganizationId,
  setRequestOrganizationId,
} from '@services/core/interceptor.service';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiClient, registerApiAuthTokenGetter } from './client';

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

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('apiClient', () => {
  describe('post', () => {
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
  });
});

describe('authorization', () => {
  afterEach(() => {
    registerApiAuthTokenGetter(null);
    clearRequestOrganizationId();
  });

  it('sends the routed organization header with the bearer token', async () => {
    registerApiAuthTokenGetter(async () => 'session-token');
    setRequestOrganizationId('org-a');
    fetchMock.mockResolvedValueOnce(createJsonResponse({}));

    await apiClient.get('/workflows', {
      headers: { [ORGANIZATION_CONTEXT_HEADER.toUpperCase()]: 'org-stale' },
    });

    expect(fetchMock).toHaveBeenCalledWith(`${API_BASE_URL}/workflows`, {
      headers: {
        Authorization: 'Bearer session-token',
        'Content-Type': 'application/json',
        [ORGANIZATION_CONTEXT_HEADER]: 'org-a',
      },
      method: 'GET',
    });
  });

  it('omits the header when the resolver has no token to give', async () => {
    registerApiAuthTokenGetter(async () => null);
    fetchMock.mockResolvedValueOnce(createJsonResponse({}));

    await apiClient.get('/workflows');

    expect(fetchMock).toHaveBeenCalledWith(`${API_BASE_URL}/workflows`, {
      headers: { 'Content-Type': 'application/json' },
      method: 'GET',
    });
  });

  it('replaces a default header supplied under different casing', async () => {
    registerApiAuthTokenGetter(async () => 'session-token');
    fetchMock.mockResolvedValueOnce(createJsonResponse({}));

    await apiClient.post(
      '/workflows/run',
      { id: 'workflow-1' },
      { headers: { 'content-type': 'text/plain' } },
    );

    expect(fetchMock).toHaveBeenCalledWith(`${API_BASE_URL}/workflows/run`, {
      body: JSON.stringify({ id: 'workflow-1' }),
      headers: {
        Authorization: 'Bearer session-token',
        'Content-Type': 'text/plain',
      },
      method: 'POST',
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
});
