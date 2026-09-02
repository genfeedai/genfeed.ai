import { API_ENDPOINTS } from '@genfeedai/contracts/constants';
import { AgentPublishAuditsService } from '@services/content/agent-publish-audits.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockInstance = {
  post: vi.fn(),
};

vi.mock('@services/core/base.service', () => ({
  BaseService: class MockBaseService {
    public instance = mockInstance;

    static getDataServiceInstance<T>(
      ServiceClass: new (token: string) => T,
      token: string,
    ): T {
      return new ServiceClass(token);
    }
  },
}));

describe('AgentPublishAuditsService', () => {
  let service: AgentPublishAuditsService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AgentPublishAuditsService('token');
  });

  it('constructs a token-scoped instance against the canonical route', () => {
    expect(service).toBeInstanceOf(AgentPublishAuditsService);
    expect(AgentPublishAuditsService.getInstance('token')).toBeInstanceOf(
      AgentPublishAuditsService,
    );
    expect(API_ENDPOINTS.AGENT_PUBLISH_AUDITS).toBe('/agent-publish-audits');
  });
});
