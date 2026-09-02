import { BaseEntity } from '@api/entities/base.entity';
import { type CreditBalance } from '@genfeedai/prisma';

export class CreditBalanceEntity extends BaseEntity implements CreditBalance {
  declare readonly id: string;
  declare readonly organizationId: string | null;
  declare readonly billingAccountId: string | null;
  declare readonly balance: number;
  declare readonly heldAmount: number;
  declare readonly version: number;
  declare readonly expiresAt?: Date;
}
