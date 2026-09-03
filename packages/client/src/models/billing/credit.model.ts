import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type { CreditEntityModel } from '@genfeedai/contracts';
import type { ICredit } from '@genfeedai/contracts/interfaces';

export class Credit extends BaseEntity implements ICredit {
  declare public entity: string;
  declare public entityModel: CreditEntityModel;
  declare public balance: number;

  constructor(data: Partial<ICredit> = {}) {
    super(data);
  }
}
