import { OrganizationSetting as BaseOrganizationSetting } from '@genfeedai/client/models';
import type { IOrganizationSetting } from '@genfeedai/interfaces';

export class OrganizationSetting extends BaseOrganizationSetting {
  constructor(partial: Partial<IOrganizationSetting> = {}) {
    super(partial);
  }
}
