/**
 * Customers Module
 * Stripe customer integration: customer records, payment methods,
billing history, and subscription management.
 */

import { CustomersService } from '@api/collections/customers/services/customers.service';
import { Module } from '@nestjs/common';
import { CacheModule } from '@server/services/cache/cache.module';

@Module({
  controllers: [],
  exports: [CustomersService],
  imports: [CacheModule],
  providers: [CustomersService],
})
export class CustomersModule {}
