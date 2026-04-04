import { beforeEach, describe, expect, it, vi } from 'vitest';
import { validateApiKey, whoami } from '../../src/api/auth.js';

const mockApiKey = vi.fn<[], string | undefined>();
const mockApiUrl = vi.fn<[], string>();
const mockFetch = vi.fn();

vi.mock('../../src/config/store.js', () => ({
  getApiKey: () => mockApiKey(),
  getApiUrl: () => mockApiUrl(),
}));

vi.mock('ofetch', () => ({
  ofetch: {
    create: () => mockFetch,
  },
}));

describe('api/auth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiUrl.mockReturnValue('https://api.genfeed.ai/v1');
    mockApiKey.mockReturnValue(undefined);
  });

  describe('whoami', () => {
    it('returns user and organization data', async () => {
      const mockResponse = {
        data: {
          organization: { id: 'org-1', name: 'Test Org' },
          scopes: ['read', 'write'],
          user: { email: 'test@example.com', id: 'user-1', name: 'Test User' },
        },
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await whoami();

      expect(mockFetch).toHaveBeenCalledWith('/auth/whoami', { method: 'GET' });
      expect(result.user.email).toBe('test@example.com');
      expect(result.organization.name).toBe('Test Org');
      expect(result.scopes).toContain('read');
    });

    it('returns scopes array', async () => {
      const mockResponse = {
        data: {
          organization: { id: 'org-1', name: 'Test Org' },
          scopes: ['admin', 'read', 'write'],
          user: { email: 'test@example.com', id: 'user-1', name: 'Test User' },
        },
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await whoami();

      expect(result.scopes).toHaveLength(3);
      expect(result.scopes).toContain('admin');
    });
  });

  describe('validateApiKey', () => {
    it('calls whoami to validate the API key', async () => {
      const mockResponse = {
        data: {
          organization: { id: 'org-1', name: 'Test Org' },
          scopes: ['read'],
          user: { email: 'test@example.com', id: 'user-1', name: 'Test User' },
        },
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await validateApiKey();

      expect(mockFetch).toHaveBeenCalledWith('/auth/whoami', { method: 'GET' });
      expect(result.user.id).toBe('user-1');
    });

    it('propagates errors from whoami', async () => {
      mockFetch.mockRejectedValue(new Error('Unauthorized'));

      await expect(validateApiKey()).rejects.toThrow('Unauthorized');
    });
  });
});
