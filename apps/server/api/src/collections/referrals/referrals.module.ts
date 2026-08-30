import { ActivitiesModule } from '@api/collections/activities/activities.module';
import { BillingAccountsModule } from '@api/collections/billing-accounts/billing-accounts.module';
import { CreditsModule } from '@api/collections/credits/credits.module';
import { ReferralsController } from '@api/collections/referrals/controllers/referrals.controller';
import { ReferralsService } from '@api/collections/referrals/services/referrals.service';
import { billingControllers } from '@api/common/subscriptions/billing.providers';
import { Module } from '@nestjs/common';

@Module({
  controllers: billingControllers([ReferralsController]),
  exports: [ReferralsService],
  imports: [ActivitiesModule, BillingAccountsModule, CreditsModule],
  providers: [ReferralsService],
})
export class ReferralsModule {}
