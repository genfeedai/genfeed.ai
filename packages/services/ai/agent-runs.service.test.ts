import {
  collectionDocument,
  fetchResponse,
  installMockFetch,
  resourceDocument,
} from '@services/__mocks__/http.mock';
import { AgentRunsService } from '@services/ai/agent-runs.service';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

describe('AgentRunsService', () => {
  const token = 'agent-runs-token';
  let fetchMock: ReturnType<typeof installMockFetch>;

  beforeEach(() => {
    AgentRunsService.clearInstance(token);
    fetchMock = installMockFetch();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  describe('getInstance', () => {
    it('returns a cached instance per token', () => {
      const first = AgentRunsService.getInstance(token);
      const second = AgentRunsService.getInstance(token);
      expect(first).toBe(second);
    });

    it('creates a fresh instance after clearInstance', () => {
      const first = AgentRunsService.getInstance(token);
      AgentRunsService.clearInstance(token);
      const second = AgentRunsService.getInstance(token);
      expect(first).not.toBe(second);
    });
  });

  describe('list', () => {
    it('requests /runs without query when no params', async () => {
      fetchMock.mockResolvedValue(
        fetchResponse(collectionDocument([{ id: 'run_1', label: 'Run 1' }])),
      );

      const service = AgentRunsService.getInstance(token);
      const result = await service.list();

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('/runs');
      expect(url).not.toContain('?');
      expect(init.method).toBe('GET');
      expect((init.headers as Record<string, string>).Authorization).toBe(
        `Bearer ${token}`,
      );
      expect(result).toEqual([{ id: 'run_1', label: 'Run 1' }]);
    });

    it('serializes every provided filter into the query string', async () => {
      fetchMock.mockResolvedValue(fetchResponse(collectionDocument([])));

      const service = AgentRunsService.getInstance(token);
      await service.list({
        historyOnly: true,
        model: 'gpt',
        page: 2,
        q: 'search',
        routingPolicy: 'auto',
        sortMode: 'recent',
        status: 'RUNNING',
        strategy: 'strat_1',
        trigger: 'manual',
        webSearchEnabled: false,
      });

      const [url] = fetchMock.mock.calls[0] as [string];
      const query = new URL(url, 'http://localhost').searchParams;
      expect(query.get('page')).toBe('2');
      expect(query.get('status')).toBe('RUNNING');
      expect(query.get('trigger')).toBe('manual');
      expect(query.get('strategy')).toBe('strat_1');
      expect(query.get('q')).toBe('search');
      expect(query.get('model')).toBe('gpt');
      expect(query.get('routingPolicy')).toBe('auto');
      expect(query.get('sortMode')).toBe('recent');
      expect(query.get('historyOnly')).toBe('true');
      expect(query.get('webSearchEnabled')).toBe('false');
    });

    it('throws on a non-ok response', async () => {
      fetchMock.mockResolvedValue(fetchResponse({}, { ok: false }));

      const service = AgentRunsService.getInstance(token);
      await expect(service.list()).rejects.toThrow('Failed to list agent runs');
    });
  });

  describe('getActive', () => {
    it('requests /runs/active and deserializes the collection', async () => {
      fetchMock.mockResolvedValue(
        fetchResponse(collectionDocument([{ id: 'run_9' }])),
      );

      const service = AgentRunsService.getInstance(token);
      const result = await service.getActive();

      const [url] = fetchMock.mock.calls[0] as [string];
      expect(url).toContain('/runs/active');
      expect(result).toEqual([{ id: 'run_9' }]);
    });
  });

  describe('getStats', () => {
    it('includes the timeRange filter when provided', async () => {
      fetchMock.mockResolvedValue(fetchResponse({ total: 3 }));

      const service = AgentRunsService.getInstance(token);
      const stats = await service.getStats({ timeRange: '7d' });

      const [url] = fetchMock.mock.calls[0] as [string];
      expect(url).toContain('/runs/stats?timeRange=7d');
      expect(stats).toEqual({ total: 3 });
    });

    it('omits the query string when no params', async () => {
      fetchMock.mockResolvedValue(fetchResponse({ total: 0 }));

      const service = AgentRunsService.getInstance(token);
      await service.getStats();

      const [url] = fetchMock.mock.calls[0] as [string];
      expect(url.endsWith('/runs/stats')).toBe(true);
    });
  });

  describe('getById', () => {
    it('requests /runs/:id and deserializes the resource', async () => {
      fetchMock.mockResolvedValue(
        fetchResponse(resourceDocument({ label: 'Run' }, { id: 'run_5' })),
      );

      const service = AgentRunsService.getInstance(token);
      const run = await service.getById('run_5');

      const [url] = fetchMock.mock.calls[0] as [string];
      expect(url).toContain('/runs/run_5');
      expect(run).toEqual({ id: 'run_5', label: 'Run' });
    });
  });

  describe('create', () => {
    it('POSTs the payload as JSON', async () => {
      fetchMock.mockResolvedValue(
        fetchResponse(resourceDocument({ label: 'New run' }, { id: 'run_n' })),
      );

      const service = AgentRunsService.getInstance(token);
      const run = await service.create({
        creditBudget: 100,
        label: 'New run',
        objective: 'ship',
      });

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url.endsWith('/runs')).toBe(true);
      expect(init.method).toBe('POST');
      expect(JSON.parse(init.body as string)).toEqual({
        creditBudget: 100,
        label: 'New run',
        objective: 'ship',
      });
      expect((init.headers as Record<string, string>)['Content-Type']).toBe(
        'application/json',
      );
      expect(run.id).toBe('run_n');
    });
  });

  describe('cancel and retry', () => {
    it('POSTs to /runs/:id/cancellations', async () => {
      fetchMock.mockResolvedValue(
        fetchResponse(resourceDocument({}, { id: 'run_c' })),
      );

      const service = AgentRunsService.getInstance(token);
      await service.cancel('run_c');

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('/runs/run_c/cancellations');
      expect(init.method).toBe('POST');
    });

    it('POSTs to /runs/:id/retries', async () => {
      fetchMock.mockResolvedValue(
        fetchResponse(resourceDocument({}, { id: 'run_r' })),
      );

      const service = AgentRunsService.getInstance(token);
      await service.retry('run_r');

      const [url] = fetchMock.mock.calls[0] as [string];
      expect(url).toContain('/runs/run_r/retries');
    });
  });

  describe('getBatch', () => {
    it('returns [] without fetching when ids is empty', async () => {
      const service = AgentRunsService.getInstance(token);
      const result = await service.getBatch([]);

      expect(result).toEqual([]);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('requests /runs/batch with comma-joined ids', async () => {
      fetchMock.mockResolvedValue(
        fetchResponse({
          runs: [{ contentCount: 2, id: 'run_1', threadId: null }],
        }),
      );

      const service = AgentRunsService.getInstance(token);
      const result = await service.getBatch(['run_1', 'run_2']);

      const [url] = fetchMock.mock.calls[0] as [string];
      expect(url).toContain('/runs/batch?ids=run_1,run_2');
      expect(result).toEqual([
        { contentCount: 2, id: 'run_1', threadId: null },
      ]);
    });
  });

  describe('getRunContent', () => {
    it('GETs /runs/:id/content with the abort signal', async () => {
      const controller = new AbortController();
      fetchMock.mockResolvedValue(fetchResponse({ items: [] }));

      const service = AgentRunsService.getInstance(token);
      const content = await service.getRunContent('run_x', controller.signal);

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('/runs/run_x/content');
      expect(init.signal).toBe(controller.signal);
      expect(content).toEqual({ items: [] });
    });

    it('throws when the response is not ok', async () => {
      fetchMock.mockResolvedValue(fetchResponse({}, { ok: false }));

      const service = AgentRunsService.getInstance(token);
      await expect(service.getRunContent('run_x')).rejects.toThrow(
        'Failed to get run content',
      );
    });
  });
});
