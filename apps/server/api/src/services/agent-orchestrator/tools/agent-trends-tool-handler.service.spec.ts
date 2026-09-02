import { AgentTrendsToolHandler } from '@api/services/agent-orchestrator/tools/agent-trends-tool-handler.service';

describe('AgentTrendsToolHandler', () => {
  it('returns an unavailable result without retrying through live ingestion', async () => {
    const trendsService = {
      getTrends: vi.fn().mockResolvedValue([]),
    };
    const service = new AgentTrendsToolHandler(trendsService as never);

    const result = await service.getTrends({ platform: 'youtube' }, {
      organizationId: 'org-1',
    } as never);

    expect(trendsService.getTrends).toHaveBeenCalledTimes(1);
    expect(trendsService.getTrends).toHaveBeenCalledWith(
      'org-1',
      undefined,
      'youtube',
      { allowFetchIfMissing: false },
    );
    expect(result).toMatchObject({
      data: { count: 0, trends: [] },
      success: true,
    });
  });
});
