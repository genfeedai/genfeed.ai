import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type { CreditEntityModel } from '@genfeedai/enums';
import type { ICredit } from '@genfeedai/interfaces';

export class Credit extends BaseEntity implements ICredit {
  public declare entity: string;
  public declare entityModel: CreditEntityModel;
  public declare balance: number;

  constructor(data: Partial<ICredit> = {}) {
    super(data);
  }
}
