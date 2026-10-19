import { MAX_PAGE_SIZE } from '@genfeedai/contracts/constants';
import {
  axiosResponse,
  collectionDocument,
  installMockHttp,
  type MockHttpInstance,
} from '@services/__mocks__/http.mock';
import { AgentCampaignsService } from '@services/automation/agent-campaigns.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('AgentCampaignsService.list', () => {
  let service: AgentCampaignsService;
  let http: MockHttpInstance;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AgentCampaignsService('campaigns-token');
    http = installMockHttp(service);
    http.get.mockResolvedValue(
      axiosResponse(collectionDocument([{ id: 'campaign_1', label: 'C' }])),
    );
  });

  it('walks every server page when no page is requested', async () => {
    const result = await service.list({ status: 'active' });

    expect(http.get).toHaveBeenCalledWith('', {
      params: { limit: MAX_PAGE_SIZE, page: 1, status: 'active' },
      signal: undefined,
    });
    expect(result).toHaveLength(1);
  });

  it('requests just the given server page', async () => {
    await service.list({ limit: 15, page: 2 });

    expect(http.get).toHaveBeenCalledTimes(1);
    expect(http.get).toHaveBeenCalledWith('', {
      params: { limit: 15, page: 2 },
      signal: undefined,
    });
  });
});
