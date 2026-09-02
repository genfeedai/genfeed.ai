import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type { IAgentPublishAudit } from '@genfeedai/contracts/interfaces';

export class AgentPublishAudit
  extends BaseEntity
  implements IAgentPublishAudit
{
  public declare workflowExecutionId?: string | null;
  public declare agentStrategyId?: string | null;
  public declare agentThreadId?: string | null;
  public declare autonomyMode: string;
  public declare brand?: IAgentPublishAudit['brand'];
  public declare brandId?: string | null;
  public declare channel?: string | null;
  public declare decision: IAgentPublishAudit['decision'];
  public declare organization?: IAgentPublishAudit['organization'];
  public declare organizationId: string;
  public declare policyName: string;
  public declare postGroupId?: string | null;
  public declare reason: string;
  public declare user?: IAgentPublishAudit['user'];
  public declare userId: string;

  constructor(data: Partial<IAgentPublishAudit> = {}) {
    super(data);
  }
}
