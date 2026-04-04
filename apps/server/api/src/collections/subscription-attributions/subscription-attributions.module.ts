/**
 * Subscription Attributions Module
 * Subscription attribution: track which content led to subscriptions,
Stripe integration, conversion analytics, and revenue attribution.
 */
import { SubscriptionAttributionsController } from '@api/collections/subscription-attributions/controllers/subscription-attributions.controller';
import {
  SubscriptionAttribution,
  SubscriptionAttributionSchema,
} from '@api/collections/subscription-attributions/schemas/subscription-attribution.schema';
import { SubscriptionAttributionsService } from '@api/collections/subscription-attributions/services/subscription-attributions.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import mongooseAggregatePaginateV2 from 'mongoose-aggregate-paginate-v2';

@Module({
  controllers: [SubscriptionAttributionsController],
  exports: [MongooseModule, SubscriptionAttributionsService],
  imports: [
    MongooseModule.forFeatureAsync(
      [
        {
          name: SubscriptionAttribution.name,
          useFactory: () => {
            const schema = SubscriptionAttributionSchema;

            schema.plugin(mongooseAggregatePaginateV2);

            // Indexes
            schema.index({ organization: 1, status: 1 });
            schema.index({ 'source.content': 1 });

            return schema;
          },
        },
      ],
      DB_CONNECTIONS.AUTH,
    ),
  ],
  providers: [SubscriptionAttributionsService],
})
export class SubscriptionAttributionsModule {}
