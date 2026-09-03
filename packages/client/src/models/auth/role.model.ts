import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type { IRole } from '@genfeedai/contracts/interfaces';

export class Role extends BaseEntity implements IRole {
  declare public label: string;
  declare public key: string;
  declare public primaryColor?: string;

  constructor(data: Partial<IRole> = {}) {
    super(data);
  }
}
