import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type { PersistedDashboardLayoutDocument } from '@genfeedai/contracts/interfaces/ai/agent-ui-block.interface';
import type { IDashboardLayout } from '@genfeedai/contracts/interfaces/content/dashboard-layout.interface';

export class DashboardLayout extends BaseEntity implements IDashboardLayout {
  declare public organizationId: string;
  declare public brandId: string;
  declare public pageKey: string;
  declare public document: PersistedDashboardLayoutDocument;
  declare public version: number;

  constructor(data: Partial<IDashboardLayout> = {}) {
    super(data);
  }
}
