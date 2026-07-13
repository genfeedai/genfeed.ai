import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type {
  IDashboardLayout,
  PersistedDashboardLayoutDocument,
} from '@genfeedai/interfaces';

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
