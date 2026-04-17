import type { Customer } from '@api/collections/customers/schemas/customer.schema';
import { BaseEntity } from '@api/shared/entities/base/base.entity';

export class CustomerEntity extends BaseEntity implements Customer {
  declare readonly organization: string;

  declare readonly stripeCustomerId: string;
}
