import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupApi } from './setup';

// Mock the apiClient
vi.mock('./client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

describe('setupApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('getStatus', () => {
    it('should fetch setup status', async () => {
      const { apiClient } = await import('./client');
      const mockStatus = {
        detectedTools: {
          anthropic: { installed: true },
          claude: { installed: false },
          codex: { installed: true },
          replicate: { installed: true },
        },
        hasCompletedSetup: true,
      };
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockStatus);

      const result = await setupApi.getStatus();

      expect(apiClient.get).toHaveBeenCalledWith('/setup/status', {
        signal: undefined,
      });
      expect(result).toEqual(mockStatus);
    });

    it('should pass abort signal when provided', async () => {
      const { apiClient } = await import('./client');
      vi.mocked(apiClient.get).mockResolvedValueOnce({
        detectedTools: {},
        hasCompletedSetup: false,
      });

      const controller = new AbortController();
      await setupApi.getStatus(controller.signal);

      expect(apiClient.get).toHaveBeenCalledWith('/setup/status', {
        signal: controller.signal,
      });
    });
  });

  describe('complete', () => {
    it('should post complete setup with replicate key', async () => {
      const { apiClient } = await import('./client');
      const mockResponse = { hasCompletedSetup: true };
      vi.mocked(apiClient.post).mockResolvedValueOnce(mockResponse);

      const data = { replicateApiKey: 'r8_test_key_123' };
      const result = await setupApi.complete(data);

      expect(apiClient.post).toHaveBeenCalledWith('/setup/complete', data, {
        signal: undefined,
      });
      expect(result).toEqual(mockResponse);
    });

    it('should pass abort signal when provided', async () => {
      const { apiClient } = await import('./client');
      vi.mocked(apiClient.post).mockResolvedValueOnce({
        hasCompletedSetup: true,
      });

      const controller = new AbortController();
      const data = { replicateApiKey: 'r8_test_key_123' };
      await setupApi.complete(data, controller.signal);

      expect(apiClient.post).toHaveBeenCalledWith('/setup/complete', data, {
        signal: controller.signal,
      });
    });
  });

  describe('validateKey', () => {
    it('should validate a provider key', async () => {
      const { apiClient } = await import('./client');
      const mockResult = { message: 'Key is valid', valid: true };
      vi.mocked(apiClient.post).mockResolvedValueOnce(mockResult);

      const data = { apiKey: 'r8_test_key', provider: 'replicate' };
      const result = await setupApi.validateKey(data);

      expect(apiClient.post).toHaveBeenCalledWith('/setup/validate-key', data, {
        signal: undefined,
      });
      expect(result).toEqual(mockResult);
    });

    it('should return invalid result for bad key', async () => {
      const { apiClient } = await import('./client');
      const mockResult = { message: 'Invalid API key', valid: false };
      vi.mocked(apiClient.post).mockResolvedValueOnce(mockResult);

      const data = { apiKey: 'bad_key', provider: 'replicate' };
      const result = await setupApi.validateKey(data);

      expect(result.valid).toBe(false);
      expect(result.message).toBe('Invalid API key');
    });

    it('should pass abort signal when provided', async () => {
      const { apiClient } = await import('./client');
      vi.mocked(apiClient.post).mockResolvedValueOnce({ valid: true });

      const controller = new AbortController();
      const data = { apiKey: 'r8_key', provider: 'replicate' };
      await setupApi.validateKey(data, controller.signal);

      expect(apiClient.post).toHaveBeenCalledWith('/setup/validate-key', data, {
        signal: controller.signal,
      });
    });
  });

  describe('detectTools', () => {
    it('should detect installed tools', async () => {
      const { apiClient } = await import('./client');
      const mockTools = {
        anthropic: { installed: true },
        claude: { installed: false },
        codex: { installed: true },
        replicate: { installed: true },
      };
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockTools);

      const result = await setupApi.detectTools();

      expect(apiClient.get).toHaveBeenCalledWith('/setup/detect-tools', {
        signal: undefined,
      });
      expect(result).toEqual(mockTools);
    });

    it('should pass abort signal when provided', async () => {
      const { apiClient } = await import('./client');
      vi.mocked(apiClient.get).mockResolvedValueOnce({});

      const controller = new AbortController();
      await setupApi.detectTools(controller.signal);

      expect(apiClient.get).toHaveBeenCalledWith('/setup/detect-tools', {
        signal: controller.signal,
      });
    });
  });
});
