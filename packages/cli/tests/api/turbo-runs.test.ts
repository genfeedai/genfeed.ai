import { TurboRunStatus } from '@genfeedai/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  turboRunItemAction,
  cancelTurboRun,
  createTurboRun,
  getTurboRun,
  listTurboRuns,
} from '../../src/api/turbo-runs';

const mockApiKey = vi.fn<[], string | undefined>();
const mockApiUrl = vi.fn<[], string>();
const mockFetch = vi.fn();

vi.mock('../../src/config/store', () => ({
  getApiKey: () => mockApiKey(),
  getApiUrl: () => mockApiUrl(),
}));

vi.mock('ofetch', () => ({
  ofetch: {
    create: () => mockFetch,
  },
}));

describe('api/turbo-runs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiUrl.mockReturnValue('https://api.genfeed.ai/v1');
    mockApiKey.mockReturnValue(undefined);
  });

  describe('createTurboRun', () => {
    it('posts brandId to /batches and never sends the legacy brand key', async () => {
      mockFetch.mockResolvedValue({
        data: {
          attributes: {
            count: 3,
            platforms: ['twitter', 'linkedin'],
            status: TurboRunStatus.PENDING,
          },
          id: 'run-1',
          type: 'turbo-run',
        },
      });

      const result = await createTurboRun({
        brandId: 'brand-1',
        count: 3,
        platforms: ['twitter', 'linkedin'],
      });

      expect(mockFetch).toHaveBeenCalledWith('/turbo-runs', {
        body: {
          brandId: 'brand-1',
          count: 3,
          platforms: ['twitter', 'linkedin'],
        },
        method: 'POST',
      });

      const body = mockFetch.mock.calls[0][1].body as Record<string, unknown>;
      expect(body).toHaveProperty('brandId', 'brand-1');
      expect(body).not.toHaveProperty('brand');
      expect(result.id).toBe('run-1');
      expect(result.status).toBe(TurboRunStatus.PENDING);
    });
  });

  describe('listTurboRuns', () => {
    it('lists runs without params', async () => {
      mockFetch.mockResolvedValue({ data: [] });

      const result = await listTurboRuns();

      expect(mockFetch).toHaveBeenCalledWith('/turbo-runs', { method: 'GET' });
      expect(result).toEqual([]);
    });

    it('lists runs with status and limit filters', async () => {
      mockFetch.mockResolvedValue({ data: [] });

      await listTurboRuns({ limit: 5, status: TurboRunStatus.PENDING });

      expect(mockFetch).toHaveBeenCalledWith(`/turbo-runs?status=${TurboRunStatus.PENDING}&limit=5`, {
        method: 'GET',
      });
    });
  });

  describe('getTurboRun', () => {
    it('fetches a run detail by id', async () => {
      mockFetch.mockResolvedValue({
        data: {
          attributes: { count: 1, platforms: ['twitter'], status: TurboRunStatus.COMPLETED },
          id: 'run-9',
          type: 'turbo-run',
        },
      });

      const result = await getTurboRun('run-9');

      expect(mockFetch).toHaveBeenCalledWith('/turbo-runs/run-9', { method: 'GET' });
      expect(result.id).toBe('run-9');
      expect(result.status).toBe(TurboRunStatus.COMPLETED);
    });
  });

  describe('turboRunItemAction', () => {
    it('posts an approve action with item ids', async () => {
      mockFetch.mockResolvedValue({ data: null });

      await turboRunItemAction('run-1', { action: 'approve', itemIds: ['item-1', 'item-2'] });

      expect(mockFetch).toHaveBeenCalledWith('/turbo-runs/run-1/items/action', {
        body: { action: 'approve', itemIds: ['item-1', 'item-2'] },
        method: 'POST',
      });
    });
  });

  describe('cancelTurboRun', () => {
    it('patches the run status to CANCELLED', async () => {
      mockFetch.mockResolvedValue({ data: null });

      await cancelTurboRun('run-1');

      expect(mockFetch).toHaveBeenCalledWith('/turbo-runs/run-1', {
        body: { status: TurboRunStatus.CANCELLED },
        method: 'PATCH',
      });
    });
  });
});
