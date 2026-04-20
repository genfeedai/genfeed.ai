/**
 * Customers Module
 * Stripe customer integration: customer records, payment methods,
billing history, and subscription management.
 */

import { CustomersService } from '@api/collections/customers/services/customers.service';
import { Module } from '@nestjs/common';

@Module({
  controllers: [],
  exports: [CustomersService],
  imports: [],
  providers: [CustomersService],
})
export class CustomersModule {}
