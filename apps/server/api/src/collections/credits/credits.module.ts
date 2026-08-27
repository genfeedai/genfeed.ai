/**
 * Credits Module
 * Usage credits system: track AI generation credits, manage credit packages,
and enforce usage limits.
 */
import { BillingAccountsModule } from '@api/collections/billing-accounts/billing-accounts.module';
import { CreditsController } from '@api/collections/credits/controllers/credits.controller';
import { CreditReservationService } from '@api/collections/credits/services/credit-reservation.service';
import { TopbarBalancesService } from '@api/collections/credits/services/topbar-balances.service';
import { OrganizationSettingsModule } from '@api/collections/organization-settings/organization-settings.module';
import { CommonModule } from '@api/common/common.module';
import { OssCreditsUtilsService } from '@api/common/credits/oss-credits-utils.service';
import { TransactionModule } from '@api/helpers/utils/transaction/transaction.module';
import { CreditDeductionModule } from '@api/queues/credit-deduction/credit-deduction.module';
import { ByokModule } from '@api/services/byok/byok.module';
import { NotificationsPublisherModule } from '@api/services/notifications/publisher/notifications-publisher.module';
import { usesMeteredCredits } from '@genfeedai/config';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { CreditBalanceService } from '@server/collections/credits/services/credit-balance.service';
import { CreditTransactionsService } from '@server/collections/credits/services/credit-transactions.service';
import { CreditsUtilsService } from '@server/collections/credits/services/credits.utils.service';
import { VideoGenerationLineageService } from '@server/collections/credits/services/video-generation-lineage.service';

@Module({
  controllers: [CreditsController],
  exports: [
    CreditBalanceService,
    CreditDeductionModule,
    CreditReservationService,
    CreditTransactionsService,
    CreditsUtilsService,
    VideoGenerationLineageService,
  ],
  imports: [
    BillingAccountsModule,
    ByokModule,
    CommonModule,
    CreditDeductionModule,
    NotificationsPublisherModule,
    OrganizationSettingsModule,
    HttpModule,

    TransactionModule,
  ],
  providers: [
    CreditBalanceService,
    CreditReservationService,
    CreditTransactionsService,
    VideoGenerationLineageService,
    {
      provide: CreditsUtilsService,
      // SaaS cloud AND self-hosted EE use the real ledger. Community OSS / desktop
      // get the infinite stub. `isEEEnabled()` alone was wrong — cloud SaaS with no
      // EE license key still must meter (0 balance must block generation).
      useClass: usesMeteredCredits()
        ? CreditsUtilsService
        : OssCreditsUtilsService,
    },
    TopbarBalancesService,
  ],
})
export class CreditsModule {}
