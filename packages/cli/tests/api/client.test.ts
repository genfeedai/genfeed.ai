import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthError } from '../../src/utils/errors.js';

// Mock config store
const mockApiKey = vi.fn<[], string | undefined>();
const mockApiUrl = vi.fn<[], string>();

vi.mock('@/config/store.js', () => ({
  getApiKey: () => mockApiKey(),
  getApiUrl: () => mockApiUrl(),
}));

// Mock ofetch
const mockFetch = vi.fn();

vi.mock('ofetch', () => ({
  ofetch: {
    create: () => mockFetch,
  },
}));

describe('api/client', () => {
  let get: typeof import('../../src/api/client.js').get;
  let post: typeof import('../../src/api/client.js').post;
  let requireAuth: typeof import('../../src/api/client.js').requireAuth;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockApiUrl.mockReturnValue('https://api.genfeed.ai/v1');
    mockApiKey.mockReturnValue(undefined);
    const client = await import(`../../src/api/client.ts?test-client=${Date.now()}`);
    get = client.get;
    post = client.post;
    requireAuth = client.requireAuth;
  });

  describe('requireAuth', () => {
    it('returns API key when set', async () => {
      mockApiKey.mockReturnValue('valid-api-key');
      const key = await requireAuth();
      expect(key).toBe('valid-api-key');
    });

    it('throws AuthError when no API key', async () => {
      mockApiKey.mockReturnValue(undefined);
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
