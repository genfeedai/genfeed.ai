import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type { IAgentPublishAudit } from '@genfeedai/contracts/interfaces';

export class AgentPublishAudit
  extends BaseEntity
  implements IAgentPublishAudit
{
  declare public workflowExecutionId?: string | null;
  declare public agentStrategyId?: string | null;
  declare public agentThreadId?: string | null;
  declare public autonomyMode: string;
  declare public brand?: IAgentPublishAudit['brand'];
  declare public brandId?: string | null;
  declare public channel?: string | null;
  declare public decision: IAgentPublishAudit['decision'];
  declare public organization?: IAgentPublishAudit['organization'];
  declare public organizationId: string;
  declare public policyName: string;
  declare public postGroupId?: string | null;
  declare public reason: string;
  declare public user?: IAgentPublishAudit['user'];
  declare public userId: string;

  constructor(data: Partial<IAgentPublishAudit> = {}) {
    super(data);
  }
}
