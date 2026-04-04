/**
 * User Subscriptions Module
 * User-level subscription management for consumer apps (getshareable.app).
 * Tracks individual user Stripe subscriptions independent of organization subscriptions.
 */
import {
  UserSubscription,
  UserSubscriptionSchema,
} from '@api/collections/user-subscriptions/schemas/user-subscription.schema';
import { UserSubscriptionsService } from '@api/collections/user-subscriptions/services/user-subscriptions.service';
import { ConfigModule } from '@api/config/config.module';
import { ConfigService } from '@api/config/config.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import mongooseAggregatePaginateV2 from 'mongoose-aggregate-paginate-v2';

@Module({
  controllers: [],
  exports: [MongooseModule, UserSubscriptionsService],
  imports: [
    MongooseModule.forFeatureAsync(
      [
        {
          imports: [ConfigModule],
          inject: [ConfigService],
          name: UserSubscription.name,
          useFactory: () => {
            const schema = UserSubscriptionSchema;

            schema.plugin(mongooseAggregatePaginateV2);

            schema.index(
              { isDeleted: 1, user: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            schema.index(
              { isDeleted: 1, stripeCustomerId: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            return schema;
          },
        },
      ],
      DB_CONNECTIONS.AUTH,
    ),
  ],
  providers: [UserSubscriptionsService],
})
export class UserSubscriptionsModule {}
