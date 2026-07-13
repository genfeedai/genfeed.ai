import type { PersistedDashboardLayoutDocument } from '../ai/agent-ui-block.interface';
import type { IBaseEntity } from '../core/base.interface';

export interface IDashboardLayout extends IBaseEntity {
  organizationId: string;
  brandId: string;
  pageKey: string;
  document: PersistedDashboardLayoutDocument;
  version: number;
}
