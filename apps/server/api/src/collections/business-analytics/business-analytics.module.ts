/**
 * Business Analytics Module
 * Superadmin-only business metrics: Stripe revenue, credit consumption,
 * and ingredient generation aggregations.
 */
import { BusinessAnalyticsController } from '@api/collections/business-analytics/controllers/business-analytics.controller';
import { BusinessAnalyticsService } from '@api/collections/business-analytics/services/business-analytics.service';
import {
  CreditTransactions,
  CreditTransactionsSchema,
} from '@api/collections/credits/schemas/credit-transactions.schema';
import {
  Ingredient,
  IngredientSchema,
} from '@api/collections/ingredients/schemas/ingredient.schema';
import { CommonModule } from '@api/common/common.module';
import { ConfigModule } from '@api/config/config.module';
import { ConfigService } from '@api/config/config.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { CacheModule } from '@api/services/cache/cache.module';
import { StripeModule } from '@api/services/integrations/stripe/stripe.module';
import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import mongooseAggregatePaginateV2 from 'mongoose-aggregate-paginate-v2';

@Module({
  controllers: [BusinessAnalyticsController],
  exports: [BusinessAnalyticsService],
  imports: [
    CommonModule,
    forwardRef(() => CacheModule),
    forwardRef(() => StripeModule),

    // Credit transactions on auth connection
    MongooseModule.forFeatureAsync(
      [
        {
          imports: [ConfigModule],
          inject: [ConfigService],
          name: CreditTransactions.name,
          useFactory: () => {
            const schema = CreditTransactionsSchema;
            schema.plugin(mongooseAggregatePaginateV2);
            return schema;
          },
        },
      ],
      DB_CONNECTIONS.AUTH,
    ),

    // Ingredients on cloud connection
    MongooseModule.forFeatureAsync(
      [
        {
          imports: [ConfigModule],
          inject: [ConfigService],
          name: Ingredient.name,
          useFactory: () => {
            const schema = IngredientSchema;
            schema.plugin(mongooseAggregatePaginateV2);
            return schema;
          },
        },
      ],
      DB_CONNECTIONS.CLOUD,
    ),
  ],
  providers: [BusinessAnalyticsService],
})
export class BusinessAnalyticsModule {}
