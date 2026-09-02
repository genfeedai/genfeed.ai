import type { Customer } from '@api/collections/customers/schemas/customer.schema';
import { BaseEntity } from '@api/entities/base.entity';

export class CustomerEntity extends BaseEntity implements Customer {
  declare readonly organizationId: string;
  declare readonly billingAccountId: string | null;

  declare readonly stripeCustomerId: string | null;
}
