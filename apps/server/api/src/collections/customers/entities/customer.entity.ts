import type { Customer } from '@api/collections/customers/schemas/customer.schema';
import { BaseEntity } from '@api/shared/entities/base/base.entity';
import { Types } from 'mongoose';

export class CustomerEntity extends BaseEntity implements Customer {
  declare readonly organization: Types.ObjectId;

  declare readonly stripeCustomerId: string;
}
