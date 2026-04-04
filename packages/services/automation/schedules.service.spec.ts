import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SmartSchedulerService } from './schedules.service';

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: {
    getApiUrl: vi.fn(() => 'https://api.genfeed.ai'),
  },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn(), info: vi.fn() },
}));

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

const makeOkResponse = (body: unknown) => ({
  json: async () => body,
  ok: true,
});

const makeErrResponse = () => ({
  json: async () => ({}),
  ok: false,
});

const token = 'Bearer test-token';

describe('SmartSchedulerService', () => {
  beforeEach(() => {
    SmartSchedulerService.clearInstance(token);
    mockFetch.mockReset();
  });

  afterEach(() => {
    SmartSchedulerService.clearInstance(token);
  });

  it('getInstance returns a service instance', () => {
    const svc = SmartSchedulerService.getInstance(token);
    expect(svc).toBeDefined();
  });

  it('getInstance returns the same instance for the same token', () => {
    const a = SmartSchedulerService.getInstance(token);
    const b = SmartSchedulerService.getInstance(token);
    expect(a).toBe(b);
  });

  it('getInstance returns different instances for different tokens', () => {
    const a = SmartSchedulerService.getInstance('tok-1');
    const b = SmartSchedulerService.getInstance('tok-2');
    expect(a).not.toBe(b);
    SmartSchedulerService.clearInstance('tok-1');
    SmartSchedulerService.clearInstance('tok-2');
  });

  it('clearInstance removes the cached instance', () => {
    const a = SmartSchedulerService.getInstance(token);
    SmartSchedulerService.clearInstance(token);
    const b = SmartSchedulerService.getInstance(token);
    expect(a).not.toBe(b);
  });

  it('getOptimalPostingTime POSTs to /automation/schedule/optimize', async () => {
    const recommendation = {
      confidence: 0.9,
      recommendedTime: '2026-01-01T10:00:00Z',
    };
    mockFetch.mockResolvedValue(makeOkResponse(recommendation));

    const svc = SmartSchedulerService.getInstance(token);
    const result = await svc.getOptimalPostingTime({
      brandId: 'brand-1',
      contentType: 'video',
    } as never);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/automation/schedule/optimize'),
      expect.objectContaining({ method: 'POST' }),
    );
    expect(result.confidence).toBe(0.9);
  });

  it('createSchedule POSTs to /automation/schedules', async () => {
    const schedule = { id: 'sched-1', scheduledTime: '2026-01-02T09:00:00Z' };
    mockFetch.mockResolvedValue(makeOkResponse(schedule));

    const svc = SmartSchedulerService.getInstance(token);
    const result = await svc.createSchedule({ brandId: 'brand-1' } as never);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/automation/schedules'),
      expect.objectContaining({ method: 'POST' }),
    );
    expect(result.id).toBe('sched-1');
  });

  it('getSchedules GETs /automation/schedules without filters', async () => {
    mockFetch.mockResolvedValue(makeOkResponse([]));

    const svc = SmartSchedulerService.getInstance(token);
    await svc.getSchedules();

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.genfeed.ai/automation/schedules',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('getSchedules appends query params when filters provided', async () => {
    mockFetch.mockResolvedValue(makeOkResponse([]));

    const svc = SmartSchedulerService.getInstance(token);
    await svc.getSchedules({ brandId: 'brand-1', status: 'active' });

    const url = (mockFetch.mock.calls[0] as [string])[0];
    expect(url).toContain('status=active');
    expect(url).toContain('brandId=brand-1');
  });

  it('updateSchedule PATCHes /automation/schedules/:id', async () => {
    const updated = { id: 'sched-1', scheduledTime: '2026-01-05T12:00:00Z' };
    mockFetch.mockResolvedValue(makeOkResponse(updated));

    const svc = SmartSchedulerService.getInstance(token);
    await svc.updateSchedule('sched-1', {} as never);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/automation/schedules/sched-1'),
      expect.objectContaining({ method: 'PATCH' }),
    );
  });

  it('cancelSchedule POSTs to /automation/schedules/:id/cancel', async () => {
    mockFetch.mockResolvedValue(makeOkResponse({}));

    const svc = SmartSchedulerService.getInstance(token);
    await svc.cancelSchedule('sched-2');

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/automation/schedules/sched-2/cancel'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('bulkSchedule POSTs to /automation/schedules/bulk', async () => {
    const result = { errors: [], failed: 0, scheduled: 3 };
    mockFetch.mockResolvedValue(makeOkResponse(result));

    const svc = SmartSchedulerService.getInstance(token);
    const res = await svc.bulkSchedule({ items: [] } as never);

    expect(res.scheduled).toBe(3);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/automation/schedules/bulk'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('repurposeContent POSTs to /automation/repurpose', async () => {
    const job = { id: 'repurpose-1', status: 'queued' };
    mockFetch.mockResolvedValue(makeOkResponse(job));

    const svc = SmartSchedulerService.getInstance(token);
    await svc.repurposeContent({
      contentId: 'cid-1',
      targetFormats: ['instagram_reel'] as never[],
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/automation/repurpose'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('createWorkflow POSTs to /automation/workflows', async () => {
    const wf = { id: 'wf-1', name: 'Post Flow' };
    mockFetch.mockResolvedValue(makeOkResponse(wf));

    const svc = SmartSchedulerService.getInstance(token);
    await svc.createWorkflow({ name: 'Post Flow' } as never);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/automation/workflows'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('executeWorkflow POSTs to /workflow-executions and unwraps JSON:API', async () => {
    mockFetch.mockResolvedValue(
      makeOkResponse({
        data: {
          attributes: {
            status: 'pending',
            workflow: 'wf-1',
          },
          id: 'exec-1',
          type: 'workflow-executions',
        },
      }),
    );

    const svc = SmartSchedulerService.getInstance(token);
    const result = await svc.executeWorkflow('wf-1', { prompt: 'hello' });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/workflow-executions'),
      expect.objectContaining({ method: 'POST' }),
    );

    const init = (mockFetch.mock.calls[0] as [string, RequestInit])[1];
    expect(init.body).toBe(
      JSON.stringify({
        inputValues: { prompt: 'hello' },
        workflow: 'wf-1',
      }),
    );
    expect(result.id).toBe('exec-1');
  });

  it('getExecutionStatus GETs /workflow-executions/:id and unwraps JSON:API', async () => {
    mockFetch.mockResolvedValue(
      makeOkResponse({
        data: {
          attributes: {
            status: 'completed',
            workflow: 'wf-1',
          },
          id: 'exec-2',
          type: 'workflow-executions',
        },
      }),
    );

    const svc = SmartSchedulerService.getInstance(token);
    const result = await svc.getExecutionStatus('exec-2');

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/workflow-executions/exec-2'),
      expect.objectContaining({ method: 'GET' }),
    );
    expect(result.id).toBe('exec-2');
  });

  it('throws and logs error on failed fetch response', async () => {
    mockFetch.mockResolvedValue(makeErrResponse());

    const svc = SmartSchedulerService.getInstance(token);

    await expect(svc.getSchedules()).rejects.toThrow();
  });

  it('sets Authorization header on all requests', async () => {
    mockFetch.mockResolvedValue(makeOkResponse([]));

    const svc = SmartSchedulerService.getInstance(token);
    await svc.getSchedules();

    const init = (mockFetch.mock.calls[0] as [string, RequestInit])[1];
    expect((init.headers as Record<string, string>)['Authorization']).toBe(
      `Bearer ${token}`,
    );
  });
});
