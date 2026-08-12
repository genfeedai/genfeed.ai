import {
  axiosResponse,
  collectionDocument,
  installMockHttp,
  type MockHttpInstance,
  resourceDocument,
} from '@services/__mocks__/http.mock';
import {
  AgentStrategiesService,
  AgentStrategy,
} from '@services/automation/agent-strategies.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('AgentStrategiesService', () => {
  const strategyId = 'strategy_1';
  let service: AgentStrategiesService;
  let http: MockHttpInstance;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AgentStrategiesService('strategies-token');
    http = installMockHttp(service);
  });

  it('getInstance caches per token', () => {
    const first = AgentStrategiesService.getInstance('tok');
    expect(AgentStrategiesService.getInstance('tok')).toBe(first);
  });

  it('list delegates to findAll with filters', async () => {
    http.get.mockResolvedValue(
      axiosResponse(collectionDocument([{ id: strategyId, label: 'S' }])),
    );

    const result = await service.list({ agentType: 'growth', isActive: true });

    expect(http.get).toHaveBeenCalledWith('', {
      params: { agentType: 'growth', isActive: true },
      signal: undefined,
    });
    expect(result[0]).toBeInstanceOf(AgentStrategy);
  });

  it('getById fetches one strategy', async () => {
    http.get.mockResolvedValue(
      axiosResponse(resourceDocument({ label: 'S' }, { id: strategyId })),
    );

    const result = await service.getById(strategyId);

    expect(http.get).toHaveBeenCalledWith(`/${strategyId}`, {
      params: {},
      signal: undefined,
    });
    expect(result.id).toBe(strategyId);
  });

  it('create POSTs the strategy input', async () => {
    http.post.mockResolvedValue(
      axiosResponse(resourceDocument({ label: 'New' }, { id: 'strategy_new' })),
    );

    const result = await service.create({ label: 'New' });

    expect(http.post).toHaveBeenCalledWith('', { label: 'New' });
    expect(result.id).toBe('strategy_new');
  });

  it('update PATCHes the strategy', async () => {
    http.patch.mockResolvedValue(
      axiosResponse(resourceDocument({ label: 'Edit' }, { id: strategyId })),
    );

    await service.update(strategyId, { postsPerWeek: 3 });

    expect(http.patch).toHaveBeenCalledWith(`/${strategyId}`, {
      postsPerWeek: 3,
    });
  });

  it('setActive PATCHes the isActive flag', async () => {
    http.patch.mockResolvedValue(
      axiosResponse(resourceDocument({ isActive: false }, { id: strategyId })),
    );

    await service.setActive(strategyId, false);

    expect(http.patch).toHaveBeenCalledWith(`/${strategyId}`, {
      isActive: false,
    });
  });

  it.each([
    ['runNow', 'run-now'],
    ['planNow', 'plan-now'],
  ] as const)('%s POSTs to /%s', async (method, path) => {
    http.post.mockResolvedValue(axiosResponse({ message: 'queued' }));

    const result = await service[method](strategyId);

    expect(http.post).toHaveBeenCalledWith(`/${strategyId}/${path}`);
    expect(result).toEqual({ message: 'queued' });
  });

  it('runWorkflow POSTs overrides to /run-workflow', async () => {
    const payload = {
      executionId: 'exec-1',
      filledInputs: { topic: 'Launch' },
      missingRequiredKeys: [],
      status: 'running',
      workflowId: 'wf-1',
      workflowLabel: 'Founder X Post',
    };
    http.post.mockResolvedValue(axiosResponse(payload));

    const result = await service.runWorkflow(strategyId, { topic: 'Launch' });

    expect(http.post).toHaveBeenCalledWith(`/${strategyId}/run-workflow`, {
      topic: 'Launch',
    });
    expect(result).toEqual(payload);
  });

  it('getWorkflowBinding GETs /workflow-binding', async () => {
    const binding = {
      inputs: [],
      missingRequiredKeys: [],
      preferredWorkflowId: null,
      preferredWorkflowTemplateId: 'founder-x-post',
      templateDescription: null,
      workflowId: null,
      workflowLabel: null,
    };
    http.get.mockResolvedValue(axiosResponse(binding));

    const result = await service.getWorkflowBinding(strategyId);

    expect(http.get).toHaveBeenCalledWith(`/${strategyId}/workflow-binding`);
    expect(result).toEqual(binding);
  });

  it('listOpportunities GETs the raw opportunities payload', async () => {
    const opportunities = [{ id: 'opp_1', topic: 'AI' }];
    http.get.mockResolvedValue(axiosResponse(opportunities));

    const result = await service.listOpportunities(strategyId);

    expect(http.get).toHaveBeenCalledWith(`/${strategyId}/opportunities`);
    expect(result).toEqual(opportunities);
  });

  it('listReports GETs the raw reports payload', async () => {
    const reports = [{ id: 'report_1', reportType: 'daily' }];
    http.get.mockResolvedValue(axiosResponse(reports));

    const result = await service.listReports(strategyId);

    expect(http.get).toHaveBeenCalledWith(`/${strategyId}/reports`);
    expect(result).toEqual(reports);
  });

  it('getPerformanceSnapshot GETs the snapshot', async () => {
    const snapshot = { creditsSpent: 12, publishedCount: 3 };
    http.get.mockResolvedValue(axiosResponse(snapshot));

    const result = await service.getPerformanceSnapshot(strategyId);

    expect(http.get).toHaveBeenCalledWith(
      `/${strategyId}/performance-snapshot`,
    );
    expect(result).toEqual(snapshot);
  });

  it('reportNow POSTs to the report-now action', async () => {
    const report = { id: 'report_2', reportType: 'weekly' };
    http.post.mockResolvedValue(axiosResponse(report));

    const result = await service.reportNow(strategyId);

    expect(http.post).toHaveBeenCalledWith(`/${strategyId}/report-now`);
    expect(result).toEqual(report);
  });
});
