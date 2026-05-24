import { BaseEntity } from '@api/shared/entities/base/base.entity';
import { type CreditBalance } from '@genfeedai/prisma';

export class CreditBalanceEntity extends BaseEntity implements CreditBalance {
  declare readonly id: string;
  declare readonly mongoId: string | null;
  declare readonly organizationId: string;
  declare readonly organization: string;
  declare readonly balance: number;
  declare readonly expiresAt?: Date;
}
