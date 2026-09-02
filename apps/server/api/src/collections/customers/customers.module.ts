/**
 * Customers Module
 * Stripe customer integration: customer records, payment methods,
billing history, and subscription management.
 */

import { CustomersService } from '@api/collections/customers/services/customers.service';
import { CacheModule } from '@api/services/cache/cache.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [],
  exports: [CustomersService],
  imports: [CacheModule],
  providers: [CustomersService],
})
export class CustomersModule {}
