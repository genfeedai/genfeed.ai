import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type { IEngagementRule } from '@genfeedai/contracts/interfaces';

export class EngagementRule extends BaseEntity implements IEngagementRule {
  public declare actionPayload: IEngagementRule['actionPayload'];
  public declare actionType: IEngagementRule['actionType'];
  public declare brand?: IEngagementRule['brand'];
  public declare brandId?: string | null;
  public declare isEnabled: boolean;
  public declare lastError?: string | null;
  public declare metric: IEngagementRule['metric'];
  public declare metricSnapshot?: IEngagementRule['metricSnapshot'];
  public declare mode: IEngagementRule['mode'];
  public declare organization?: IEngagementRule['organization'];
  public declare organizationId: string;
  public declare postGroupId: string;
  public declare resultingReleaseId?: string | null;
  public declare state: IEngagementRule['state'];
  public declare targetId: string;
  public declare threshold: number;
  public declare triggeredAt?: string | null;
  public declare user?: IEngagementRule['user'];
  public declare userId: string;
  public declare windowEndsAt?: string | null;

  constructor(data: Partial<IEngagementRule> = {}) {
    super(data);
  }
}
