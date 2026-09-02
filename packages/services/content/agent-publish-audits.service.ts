import { API_ENDPOINTS } from '@genfeedai/contracts/constants';
import type {
  CreateAgentPublishAuditInput,
  UpdateAgentPublishAuditInput,
} from '@genfeedai/contracts/interfaces';
import { AgentPublishAudit } from '@genfeedai/models/content/agent-publish-audit.model';
import { AgentPublishAuditSerializer } from '@genfeedai/serializers';
import { BaseService } from '@services/core/base.service';

export class AgentPublishAuditsService extends BaseService<
  AgentPublishAudit,
  CreateAgentPublishAuditInput,
  UpdateAgentPublishAuditInput
> {
  constructor(token: string) {
    super(
      API_ENDPOINTS.AGENT_PUBLISH_AUDITS,
      token,
      AgentPublishAudit,
      AgentPublishAuditSerializer,
    );
  }

  public static getInstance(token: string): AgentPublishAuditsService {
    return BaseService.getDataServiceInstance(AgentPublishAuditsService, token);
  }
}
