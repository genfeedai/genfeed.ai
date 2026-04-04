import { CreditBalance } from '@api/collections/credits/schemas/credit-balance.schema';
import { BaseEntity } from '@api/shared/entities/base/base.entity';
import { Types } from 'mongoose';

export class CreditBalanceEntity extends BaseEntity implements CreditBalance {
  declare readonly organization: Types.ObjectId;
  declare readonly balance: number;
  declare readonly expiresAt?: Date;
}
