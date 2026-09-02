import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type { PersistedDashboardLayoutDocument } from '@genfeedai/contracts/interfaces/ai/agent-ui-block.interface';
import type { IDashboardLayout } from '@genfeedai/contracts/interfaces/content/dashboard-layout.interface';

export class DashboardLayout extends BaseEntity implements IDashboardLayout {
  public declare organizationId: string;
  public declare brandId: string;
  public declare pageKey: string;
  public declare document: PersistedDashboardLayoutDocument;
  public declare version: number;

  constructor(data: Partial<IDashboardLayout> = {}) {
    super(data);
  }
}
