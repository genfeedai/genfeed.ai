import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type { IRole } from '@genfeedai/interfaces';

export class Role extends BaseEntity implements IRole {
  public declare label: string;
  public declare key: string;
  public declare primaryColor?: string;

  constructor(data: Partial<IRole> = {}) {
    super(data);
  }
}
