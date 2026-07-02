import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkflowUIHttpClient } from '../../provider/types';
import {
  configureExecutionHeaders,
  configureExecutionHttpClient,
  getExecutionHeaders,
  getExecutionHttpClient,
} from './executionApi';

describe('executionApi', () => {
  afterEach(() => {
    // Reset both registries to their standalone defaults so tests don't leak.
    configureExecutionHttpClient(undefined);
    configureExecutionHeaders(undefined);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('execution headers', () => {
    it('defaults to no headers', () => {
      expect(getExecutionHeaders()).toEqual({});
    });

    it('resolves headers from the configured provider on each call', () => {
      const provider = vi
        .fn()
        .mockReturnValueOnce({ 'X-Replicate-Key': 'a' })
        .mockReturnValueOnce({ 'X-Replicate-Key': 'b' });
      configureExecutionHeaders(provider);

      expect(getExecutionHeaders()).toEqual({ 'X-Replicate-Key': 'a' });
      expect(getExecutionHeaders()).toEqual({ 'X-Replicate-Key': 'b' });
      expect(provider).toHaveBeenCalledTimes(2);
    });

    it('reverts to no headers when reconfigured with undefined', () => {
      configureExecutionHeaders(() => ({ 'X-Fal-Key': 'k' }));
      configureExecutionHeaders(undefined);

      expect(getExecutionHeaders()).toEqual({});
    });
  });

  describe('execution HTTP client', () => {
    it('routes requests through the configured client', async () => {
      const client: WorkflowUIHttpClient = {
        post: vi.fn().mockResolvedValue({ _id: 'exec-1' }),
      };
      configureExecutionHttpClient(client);

      const result = await getExecutionHttpClient().post('/x', { a: 1 });

      expect(client.post).toHaveBeenCalledWith('/x', { a: 1 });
      expect(result).toEqual({ _id: 'exec-1' });
    });

    it('reverts to the bare-fetch default when reconfigured with undefined', async () => {
      const custom: WorkflowUIHttpClient = { post: vi.fn() };
      configureExecutionHttpClient(custom);
      configureExecutionHttpClient(undefined);

      const fetchMock = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ _id: 'default' }),
        ok: true,
      });
      vi.stubGlobal('fetch', fetchMock);

      const result = await getExecutionHttpClient().post(
        '/workflows/1/execute',
        {
          debugMode: false,
        },
      );

      expect(custom.post).not.toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ _id: 'default' });
    });

    describe('bare-fetch default', () => {
      it('POSTs JSON with Content-Type and merges caller headers', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
          json: () => Promise.resolve({ ok: true }),
          ok: true,
        });
        vi.stubGlobal('fetch', fetchMock);

        await getExecutionHttpClient().post(
          '/workflows/1/execute',
          { debugMode: true },
          { headers: { 'X-Replicate-Key': 'secret' } },
        );

        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toContain('/workflows/1/execute');
        expect(init.method).toBe('POST');
        expect(init.headers).toEqual({
          'Content-Type': 'application/json',
          'X-Replicate-Key': 'secret',
        });
        expect(init.body).toBe(JSON.stringify({ debugMode: true }));
      });

      it('omits the body when none is provided', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
          json: () => Promise.resolve({}),
          ok: true,
        });
        vi.stubGlobal('fetch', fetchMock);

        await getExecutionHttpClient().post('/executions/1/stop');

        const [, init] = fetchMock.mock.calls[0];
        expect(init.body).toBeUndefined();
      });

      it('throws the API error message on a non-ok response', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
          json: () => Promise.resolve({ message: 'nope' }),
          ok: false,
          status: 422,
        });
        vi.stubGlobal('fetch', fetchMock);

        await expect(
          getExecutionHttpClient().post('/workflows/1/execute', {}),
        ).rejects.toThrow('nope');
      });

      it('falls back to a status message when the error body has none', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
          json: () => Promise.reject(new Error('not json')),
          ok: false,
          status: 500,
        });
        vi.stubGlobal('fetch', fetchMock);

        await expect(
          getExecutionHttpClient().post('/workflows/1/execute', {}),
        ).rejects.toThrow('API error: 500');
      });
    });
  });
});
