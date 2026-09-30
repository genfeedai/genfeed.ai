import {
  mockError,
  mockFetch,
  mockJsonApiCollection,
  mockJsonApiResource,
  mockOk,
} from '@agent-tests/json-api-fetch.mock';
import type { AgentApiDecodeError } from '@genfeedai/agent/services/agent-api-error';
import { AgentStrategyApiService } from '@genfeedai/agent/services/agent-strategy-api.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function makeService() {
  return new AgentStrategyApiService({
    baseUrl: 'http://api.test',
    getToken: vi.fn().mockResolvedValue('token'),
  });
}

describe('AgentStrategyApiService', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe('getStrategies', () => {
    it('fetches strategies', async () => {
      mockJsonApiCollection([{ id: 's-1' }]);
      const service = makeService();
      const result = await service.getStrategies();
      expect(result).toEqual([{ id: 's-1' }]);
    });

    it('throws on error', async () => {
      mockError(500);
      const service = makeService();
      await expect(service.getStrategies()).rejects.toThrow('500');
    });
  });

  describe('getStrategy', () => {
    it('fetches single strategy', async () => {
      mockJsonApiResource({ id: 's-1' });
      const service = makeService();
      const result = await service.getStrategy('s-1');
      expect(result).toBeDefined();
    });

    it('throws on error', async () => {
      mockError(404);
      const service = makeService();
      await expect(service.getStrategy('s-1')).rejects.toThrow('404');
    });
  });

  describe('createStrategy', () => {
    it('creates strategy', async () => {
      mockJsonApiResource({ id: 's-1', label: 'Test' });
      const service = makeService();
      const result = await service.createStrategy({ label: 'Test' });
      expect(result).toBeDefined();
      expect(mockFetch).toHaveBeenCalledWith(
        'http://api.test/agent-strategies',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('throws on error', async () => {
      mockError(400);
      const service = makeService();
      await expect(service.createStrategy({ label: 'Test' })).rejects.toThrow(
        '400',
      );
    });

    it('maps invalid strategy documents to a typed decode error', async () => {
      mockOk({});
      const service = makeService();

      await expect(service.createStrategy({ label: 'Broken' })).rejects.toEqual(
        expect.objectContaining({
          _tag: 'AgentApiDecodeError',
          message: 'Failed to deserialize strategy',
        } satisfies Partial<AgentApiDecodeError>),
      );
    });
  });

  describe('updateStrategy', () => {
    it('updates strategy', async () => {
      mockJsonApiResource({ id: 's-1', label: 'Updated' });
      const service = makeService();
      const result = await service.updateStrategy('s-1', {
        label: 'Updated',
      });
      expect(result.label).toBe('Updated');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://api.test/agent-strategies/s-1',
        expect.objectContaining({ method: 'PATCH' }),
      );
    });

    it('throws on error', async () => {
      mockError(500);
      const service = makeService();
      await expect(service.updateStrategy('s-1', {})).rejects.toThrow('500');
    });
  });

  describe('deleteStrategy', () => {
    it('deletes strategy', async () => {
      mockJsonApiResource({ id: 's-1' });
      const service = makeService();
      await service.deleteStrategy('s-1');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://api.test/agent-strategies/s-1',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });

    it('throws on error', async () => {
      mockError(404);
      const service = makeService();
      await expect(service.deleteStrategy('s-1')).rejects.toThrow('404');
    });
  });

  describe('toggleStrategy', () => {
    it('toggles strategy', async () => {
      mockJsonApiResource({ id: 's-1', isActive: true });
      const service = makeService();
      const result = await service.toggleStrategy('s-1');
      expect(result.isActive).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://api.test/agent-strategies/s-1/toggle',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('throws on error', async () => {
      mockError(500);
      const service = makeService();
      await expect(service.toggleStrategy('s-1')).rejects.toThrow('500');
    });
  });

  describe('runNow', () => {
    it('triggers run', async () => {
      mockOk({ id: 's-1' });
      const service = makeService();
      const result = await service.runNow('s-1');
      expect(result).toEqual({ id: 's-1' });
      expect(mockFetch).toHaveBeenCalledWith(
        'http://api.test/agent-strategies/s-1/run-now',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('throws on error', async () => {
      mockError(500);
      const service = makeService();
      await expect(service.runNow('s-1')).rejects.toThrow('500');
    });
  });
});
