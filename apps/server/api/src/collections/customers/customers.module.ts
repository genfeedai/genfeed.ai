/**
 * Customers Module
 * Stripe customer integration: customer records, payment methods,
billing history, and subscription management.
 */

import {
  Customer,
  CustomerSchema,
} from '@api/collections/customers/schemas/customer.schema';
import { CustomersService } from '@api/collections/customers/services/customers.service';
import { ConfigModule } from '@api/config/config.module';
import { ConfigService } from '@api/config/config.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import mongooseAggregatePaginateV2 from 'mongoose-aggregate-paginate-v2';

@Module({
  controllers: [],
  exports: [MongooseModule, CustomersService],
  imports: [
    MongooseModule.forFeatureAsync(
      [
        {
          imports: [ConfigModule],
          inject: [ConfigService],
          name: Customer.name,
          useFactory: () => {
            const schema = CustomerSchema;
            schema.plugin(mongooseAggregatePaginateV2);

            schema.index(
              { createdAt: -1, isDeleted: 1, organization: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            schema.index({
              organization: 1,
              stripeCustomerId: 1,
            });

            return schema;
          },
        },
      ],
      DB_CONNECTIONS.AUTH,
    ),
  ],
  providers: [CustomersService],
})
export class CustomersModule {}
