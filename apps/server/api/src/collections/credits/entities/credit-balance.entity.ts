import { CreditBalance } from '@api/collections/credits/schemas/credit-balance.schema';
import { BaseEntity } from '@api/shared/entities/base/base.entity';

export class CreditBalanceEntity extends BaseEntity implements CreditBalance {
  declare readonly organization: string;
  declare readonly balance: number;
  declare readonly expiresAt?: Date;
}
