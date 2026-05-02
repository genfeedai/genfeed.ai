/**
 * Credits Module
 * Usage credits system: track AI generation credits, manage credit packages,
and enforce usage limits.
 */
import { ActivitiesModule } from '@api/collections/activities/activities.module';
import { BrandsModule } from '@api/collections/brands/brands.module';
import { CreditsController } from '@api/collections/credits/controllers/credits.controller';
import { CreditBalanceService } from '@api/collections/credits/services/credit-balance.service';
import { CreditTransactionsService } from '@api/collections/credits/services/credit-transactions.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { TopbarBalancesService } from '@api/collections/credits/services/topbar-balances.service';
import { OrganizationSettingsModule } from '@api/collections/organization-settings/organization-settings.module';
import { OrganizationsModule } from '@api/collections/organizations/organizations.module';
import { SettingsModule } from '@api/collections/settings/settings.module';
import { SubscriptionsModule } from '@api/collections/subscriptions/subscriptions.module';
import { UsersModule } from '@api/collections/users/users.module';
import { CommonModule } from '@api/common/common.module';
import { TransactionModule } from '@api/helpers/utils/transaction/transaction.module';
import { CreditDeductionModule } from '@api/queues/credit-deduction/credit-deduction.module';
import { ByokModule } from '@api/services/byok/byok.module';
import { ByokBillingModule } from '@api/services/byok-billing/byok-billing.module';
import { ClerkModule } from '@api/services/integrations/clerk/clerk.module';
import { StripeModule } from '@api/services/integrations/stripe/stripe.module';
import { NotificationsPublisherModule } from '@api/services/notifications/publisher/notifications-publisher.module';
import { HttpModule } from '@nestjs/axios';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [CreditsController],
  exports: [
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
    HttpModule,

    TransactionModule,
  ],
  providers: [
    CreditBalanceService,
    CreditTransactionsService,
    CreditsUtilsService,
    TopbarBalancesService,
  ],
})
export class CreditsModule {}
