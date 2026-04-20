import { BaseEntity } from '@api/shared/entities/base/base.entity';
import { type CreditBalance } from '@genfeedai/prisma';

export class CreditBalanceEntity extends BaseEntity implements CreditBalance {
  declare readonly organization: string;
  declare readonly balance: number;
  declare readonly expiresAt?: Date;
}
