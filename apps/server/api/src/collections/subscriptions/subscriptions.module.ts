/**
 * Subscriptions Module
 * Subscription plans: manage tiers, features, billing cycles,
and subscription status tracking.
 */

import { CreditsModule } from '@api/collections/credits/credits.module';
import { CustomersModule } from '@api/collections/customers/customers.module';
import { OrganizationsModule } from '@api/collections/organizations/organizations.module';
import { SubscriptionsController } from '@api/collections/subscriptions/controllers/subscriptions.controller';
import {
  Subscription,
  SubscriptionSchema,
} from '@api/collections/subscriptions/schemas/subscription.schema';
import { SubscriptionsService } from '@api/collections/subscriptions/services/subscriptions.service';
import { UsersModule } from '@api/collections/users/users.module';
import { ConfigModule } from '@api/config/config.module';
import { ConfigService } from '@api/config/config.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { ClerkModule } from '@api/services/integrations/clerk/clerk.module';
import { StripeModule } from '@api/services/integrations/stripe/stripe.module';
import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import mongooseAggregatePaginateV2 from 'mongoose-aggregate-paginate-v2';

@Module({
  controllers: [SubscriptionsController],
  exports: [MongooseModule, SubscriptionsService],
  imports: [
    forwardRef(() => ClerkModule),
    forwardRef(() => CreditsModule),
    forwardRef(() => CustomersModule),
    forwardRef(() => OrganizationsModule),
    forwardRef(() => StripeModule),
    forwardRef(() => UsersModule),

    MongooseModule.forFeatureAsync(
      [
        {
          imports: [ConfigModule],
          inject: [ConfigService],
          name: Subscription.name,
          useFactory: () => {
            const schema = SubscriptionSchema;

            schema.plugin(mongooseAggregatePaginateV2);

            schema.index({
              createdAt: -1,
              customer: 1,
              isDeleted: 1,
              organization: 1,
              stripeCustomerId: 1,
              user: 1,
            });

            return schema;
          },
        },
      ],
      DB_CONNECTIONS.AUTH,
    ),
  ],
  providers: [SubscriptionsService],
})
export class SubscriptionsModule {}
