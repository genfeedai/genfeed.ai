import { type AIRequest, requestAI } from '@providers/ai/ai.provider';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockFetch = vi.fn();

describe('ai.provider', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockReset();
  });

  describe('requestAI', () => {
    it('should send POST request to /api/ai', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ result: 'Generated text' }),
      });

      const request: AIRequest = {
        action: 'summarize',
        text: 'Hello world',
      };
      await requestAI(request);

      expect(mockFetch).toHaveBeenCalledWith('/api/ai', {
        body: JSON.stringify({ action: 'summarize', text: 'Hello world' }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });
    });

    it('should return the result string from response', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () =>
          Promise.resolve({ result: 'This is a summary of the text.' }),
      });

      const result = await requestAI({
        action: 'summarize',
        text: 'Some long text',
      });

      expect(result).toBe('This is a summary of the text.');
    });

    it('should handle different action types', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ result: 'Translated text' }),
      });

      const result = await requestAI({
        action: 'translate',
        text: 'Bonjour',
      });

      expect(result).toBe('Translated text');
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/ai',
        expect.objectContaining({
          body: JSON.stringify({ action: 'translate', text: 'Bonjour' }),
        }),
      );
    });

    it('should handle empty text', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ result: '' }),
      });

      const result = await requestAI({ action: 'generate', text: '' });
      expect(result).toBe('');
    });

    it('should propagate fetch errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(
        requestAI({ action: 'generate', text: 'test' }),
      ).rejects.toThrow('Network error');
    });

    it('should propagate JSON parse errors', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.reject(new Error('Invalid JSON')),
      });

      await expect(
        requestAI({ action: 'generate', text: 'test' }),
      ).rejects.toThrow('Invalid JSON');
    });
  });
});
