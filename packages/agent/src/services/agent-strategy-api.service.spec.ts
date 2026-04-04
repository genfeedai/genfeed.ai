import { AgentApiDecodeError } from '@genfeedai/agent/services/agent-api-error';
import { AgentStrategyApiService } from '@genfeedai/agent/services/agent-strategy-api.service';
import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockFetch = vi.fn();
global.fetch = mockFetch;

function makeService() {
  return new AgentStrategyApiService({
    baseUrl: 'http://api.test',
    getToken: vi.fn().mockResolvedValue('token'),
  });
}

function mockOk(data: unknown) {
  mockFetch.mockResolvedValueOnce({
    json: () => Promise.resolve(data),
    ok: true,
  });
}

function mockJsonApiResource(
  id: string,
  attrs: Record<string, unknown>,
  type = 'strategy',
) {
  mockOk({ data: { attributes: attrs, id, type } });
}

function mockJsonApiCollection(
  items: Array<Record<string, unknown>>,
  type = 'strategy',
) {
  mockOk({
    data: items.map((item) => ({
      attributes: item,
      id: String(item.id ?? '1'),
      type,
    })),
  });
}

function mockError(status: number) {
  mockFetch.mockResolvedValueOnce({ ok: false, status });
}

describe('AgentStrategyApiService', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe('getStrategies', () => {
    it('fetches strategies', async () => {
      mockJsonApiCollection([{ id: 's-1' }]);
      const service = makeService();
      const result = await Effect.runPromise(service.getStrategiesEffect());
      expect(Array.isArray(result)).toBe(true);
    });

    it('throws on error', async () => {
      mockError(500);
      const service = makeService();
      await expect(
        Effect.runPromise(service.getStrategiesEffect()),
      ).rejects.toThrow('500');
    });

    it('supports an Effect-native getStrategies flow', async () => {
      mockJsonApiCollection([{ id: 's-1' }]);
      const service = makeService();

      const result = await Effect.runPromise(service.getStrategiesEffect());

      expect(result).toEqual([{ id: 's-1' }]);
    });
  });

  describe('getStrategy', () => {
    it('fetches single strategy', async () => {
      mockJsonApiResource('s-1', { id: 's-1' });
      const service = makeService();
      const result = await Effect.runPromise(service.getStrategyEffect('s-1'));
      expect(result).toBeDefined();
    });

    it('throws on error', async () => {
      mockError(404);
      const service = makeService();
      await expect(
        Effect.runPromise(service.getStrategyEffect('s-1')),
      ).rejects.toThrow('404');
    });
  });

  describe('createStrategy', () => {
    it('creates strategy', async () => {
      mockJsonApiResource('s-1', { id: 's-1', label: 'Test' });
      const service = makeService();
      const result = await Effect.runPromise(
        service.createStrategyEffect({ label: 'Test' }),
      );
      expect(result).toBeDefined();
      expect(mockFetch).toHaveBeenCalledWith(
        'http://api.test/agent-strategies',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('throws on error', async () => {
      mockError(400);
      const service = makeService();
      await expect(
        Effect.runPromise(service.createStrategyEffect({ label: 'Test' })),
      ).rejects.toThrow('400');
    });

    it('maps invalid strategy documents to a typed decode error', async () => {
      mockOk({});
      const service = makeService();

      const error = await Effect.runPromise(
        Effect.flip(service.createStrategyEffect({ label: 'Broken' })),
      );

      expect(error).toEqual(
        expect.objectContaining({
          _tag: 'AgentApiDecodeError',
          message: 'Failed to deserialize strategy',
        } satisfies Partial<AgentApiDecodeError>),
      );
    });
  });

  describe('updateStrategy', () => {
    it('updates strategy', async () => {
      mockJsonApiResource('s-1', { id: 's-1', label: 'Updated' });
      const service = makeService();
      const result = await Effect.runPromise(
        service.updateStrategyEffect('s-1', { label: 'Updated' }),
      );
      expect(result.label).toBe('Updated');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://api.test/agent-strategies/s-1',
        expect.objectContaining({ method: 'PATCH' }),
      );
    });

    it('throws on error', async () => {
      mockError(500);
      const service = makeService();
      await expect(
        Effect.runPromise(service.updateStrategyEffect('s-1', {})),
      ).rejects.toThrow('500');
    });
  });

  describe('deleteStrategy', () => {
    it('deletes strategy', async () => {
      mockJsonApiResource('s-1', { id: 's-1' });
      const service = makeService();
      await Effect.runPromise(service.deleteStrategyEffect('s-1'));
      expect(mockFetch).toHaveBeenCalledWith(
        'http://api.test/agent-strategies/s-1',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });

    it('throws on error', async () => {
      mockError(404);
      const service = makeService();
      await expect(
        Effect.runPromise(service.deleteStrategyEffect('s-1')),
      ).rejects.toThrow('404');
    });
  });

  describe('toggleStrategy', () => {
    it('toggles strategy', async () => {
      mockJsonApiResource('s-1', { id: 's-1', isActive: true });
      const service = makeService();
      const result = await Effect.runPromise(
        service.toggleStrategyEffect('s-1'),
      );
      expect(result.isActive).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://api.test/agent-strategies/s-1/toggle',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('throws on error', async () => {
      mockError(500);
      const service = makeService();
      await expect(
        Effect.runPromise(service.toggleStrategyEffect('s-1')),
      ).rejects.toThrow('500');
    });
  });

  describe('runNow', () => {
    it('triggers run', async () => {
      mockOk({ id: 's-1' });
      const service = makeService();
      const result = await Effect.runPromise(service.runNowEffect('s-1'));
      expect(result).toEqual({ id: 's-1' });
      expect(mockFetch).toHaveBeenCalledWith(
        'http://api.test/agent-strategies/s-1/run-now',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('throws on error', async () => {
      mockError(500);
      const service = makeService();
      await expect(
        Effect.runPromise(service.runNowEffect('s-1')),
      ).rejects.toThrow('500');
    });
  });
});
