import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type { IEngagementRule } from '@genfeedai/contracts/interfaces';

export class EngagementRule extends BaseEntity implements IEngagementRule {
  declare public actionPayload: IEngagementRule['actionPayload'];
  declare public actionType: IEngagementRule['actionType'];
  declare public brand?: IEngagementRule['brand'];
  declare public brandId?: string | null;
  declare public isEnabled: boolean;
  declare public lastError?: string | null;
  declare public metric: IEngagementRule['metric'];
  declare public metricSnapshot?: IEngagementRule['metricSnapshot'];
  declare public mode: IEngagementRule['mode'];
  declare public organization?: IEngagementRule['organization'];
  declare public organizationId: string;
  declare public postGroupId: string;
  declare public resultingReleaseId?: string | null;
  declare public state: IEngagementRule['state'];
  declare public targetId: string;
  declare public threshold: number;
  declare public triggeredAt?: string | null;
  declare public user?: IEngagementRule['user'];
  declare public userId: string;
  declare public windowEndsAt?: string | null;

  constructor(data: Partial<IEngagementRule> = {}) {
    super(data);
  }
}
