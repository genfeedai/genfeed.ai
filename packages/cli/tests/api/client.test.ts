import { beforeEach, describe, expect, it, vi } from 'vitest';
import { get, post, requireAuth } from '../../src/api/client.js';
import { AuthError } from '../../src/utils/errors.js';

// Mock config store — use vi.hoisted so the mocks exist before vi.mock factories run
const { mockApiKey, mockApiUrl, mockFetch } = vi.hoisted(() => ({
  mockApiKey: vi.fn<[], string | undefined>(),
  mockApiUrl: vi.fn<[], string>(),
  mockFetch: vi.fn(),
}));

vi.mock('../../src/config/store.js', () => ({
  getApiKey: () => mockApiKey(),
  getApiUrl: () => mockApiUrl(),
}));

vi.mock('ofetch', () => ({
  ofetch: {
    create: () => mockFetch,
  },
}));

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
});
