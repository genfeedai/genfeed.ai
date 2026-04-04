/**
 * Credits Module
 * Usage credits system: track AI generation credits, manage credit packages,
and enforce usage limits.
 */
import { ActivitiesModule } from '@api/collections/activities/activities.module';
import { BrandsModule } from '@api/collections/brands/brands.module';
import { CreditsController } from '@api/collections/credits/controllers/credits.controller';
import {
  CreditBalance,
  CreditBalanceSchema,
} from '@api/collections/credits/schemas/credit-balance.schema';
import {
  CreditTransactions,
  CreditTransactionsSchema,
} from '@api/collections/credits/schemas/credit-transactions.schema';
import { CreditBalanceService } from '@api/collections/credits/services/credit-balance.service';
import { CreditTransactionsService } from '@api/collections/credits/services/credit-transactions.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { OrganizationSettingsModule } from '@api/collections/organization-settings/organization-settings.module';
import { OrganizationsModule } from '@api/collections/organizations/organizations.module';
import { SettingsModule } from '@api/collections/settings/settings.module';
import { SubscriptionsModule } from '@api/collections/subscriptions/subscriptions.module';
import { UsersModule } from '@api/collections/users/users.module';
import { CommonModule } from '@api/common/common.module';
import { ConfigModule } from '@api/config/config.module';
import { ConfigService } from '@api/config/config.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { TransactionModule } from '@api/helpers/utils/transaction/transaction.module';
import { CreditDeductionModule } from '@api/queues/credit-deduction/credit-deduction.module';
import { ByokModule } from '@api/services/byok/byok.module';
import { ByokBillingModule } from '@api/services/byok-billing/byok-billing.module';
import { ClerkModule } from '@api/services/integrations/clerk/clerk.module';
import { StripeModule } from '@api/services/integrations/stripe/stripe.module';
import { NotificationsPublisherModule } from '@api/services/notifications/publisher/notifications-publisher.module';
import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import mongooseAggregatePaginateV2 from 'mongoose-aggregate-paginate-v2';

@Module({
  controllers: [CreditsController],
  exports: [
    MongooseModule,

    CreditBalanceService,
    CreditDeductionModule,
    CreditTransactionsService,
    CreditsUtilsService,
  ],
  imports: [
    forwardRef(() => ActivitiesModule),
    forwardRef(() => BrandsModule),
    forwardRef(() => ByokBillingModule),
    forwardRef(() => ByokModule),
    forwardRef(() => ClerkModule),
    CommonModule,
    forwardRef(() => CreditDeductionModule),
    forwardRef(() => NotificationsPublisherModule),
    forwardRef(() => OrganizationSettingsModule),
    forwardRef(() => OrganizationsModule),
    forwardRef(() => SettingsModule),
    forwardRef(() => StripeModule),
    forwardRef(() => SubscriptionsModule),
    forwardRef(() => UsersModule),

    TransactionModule,

    MongooseModule.forFeatureAsync(
      [
        {
          imports: [ConfigModule],
          inject: [ConfigService],
          name: CreditBalance.name,
          useFactory: () => {
            const schema = CreditBalanceSchema;

            schema.plugin(mongooseAggregatePaginateV2);

            schema.index(
              { createdAt: -1, isDeleted: 1, organization: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            return schema;
          },
        },
        {
          imports: [ConfigModule],
          inject: [ConfigService],
          name: CreditTransactions.name,
          useFactory: () => {
            const schema = CreditTransactionsSchema;

            schema.plugin(mongooseAggregatePaginateV2);

            schema.index(
              { createdAt: -1, isDeleted: 1, organization: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            return schema;
          },
        },
      ],
      DB_CONNECTIONS.AUTH,
    ),
  ],
  providers: [
    CreditBalanceService,
    CreditTransactionsService,
    CreditsUtilsService,
  ],
})
export class CreditsModule {}
