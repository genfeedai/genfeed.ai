/**
 * Credits Module
 * Usage credits system: track AI generation credits, manage credit packages,
and enforce usage limits.
 */

import { BillingAccountsModule } from '@api/collections/billing-accounts/billing-accounts.module';
import { CreditsController } from '@api/collections/credits/controllers/credits.controller';
import { OnboardingTrialCreditsListener } from '@api/collections/credits/listeners/onboarding-trial-credits.listener';
import { CreditBalanceService } from '@api/collections/credits/services/credit-balance.service';
import { CreditReservationService } from '@api/collections/credits/services/credit-reservation.service';
import { CreditTransactionsService } from '@api/collections/credits/services/credit-transactions.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { FreeTrialService } from '@api/collections/credits/services/free-trial.service';
import { GenerationBillingService } from '@api/collections/credits/services/generation-billing.service';
import { GenerationHoldRecoveryService } from '@api/collections/credits/services/generation-hold-recovery.service';
import { GenerationLineReservationService } from '@api/collections/credits/services/generation-line-reservation.service';
import { GenerationQuoteGroupService } from '@api/collections/credits/services/generation-quote-group.service';
import { OnboardingCreditGrantsService } from '@api/collections/credits/services/onboarding-credit-grants.service';
import { TopbarBalancesService } from '@api/collections/credits/services/topbar-balances.service';
import { VideoGenerationLineageService } from '@api/collections/credits/services/video-generation-lineage.service';
import { WorkflowGenerationBillingService } from '@api/collections/credits/services/workflow-generation-billing.service';
import { OrganizationSettingsModule } from '@api/collections/organization-settings/organization-settings.module';
import { CommonModule } from '@api/common/common.module';
import { OssCreditsUtilsService } from '@api/common/credits/oss-credits-utils.service';
import { TransactionModule } from '@api/helpers/utils/transaction/transaction.module';
import { CreditDeductionModule } from '@api/queues/credit-deduction/credit-deduction.module';
import { ActivityRecordingModule } from '@api/services/activity-recording/activity-recording.module';
import { ServerFunnelCaptureModule } from '@api/services/analytics/server-funnel-capture.module';
import { ApiKeyHelperModule } from '@api/services/api-key/api-key-helper.module';
import { ByokModule } from '@api/services/byok/byok.module';
import { MediaGenerationReceiptsModule } from '@api/services/media-generation-receipts/media-generation-receipts.module';
import { NotificationsPublisherModule } from '@api/services/notifications/publisher/notifications-publisher.module';
import { usesMeteredCredits } from '@genfeedai/config';
import { ConfigModule } from '@libs/config/config.module';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

@Module({
  controllers: [CreditsController],
  exports: [
    OnboardingCreditGrantsService,
    CreditBalanceService,
    CreditDeductionModule,
    CreditReservationService,
    CreditTransactionsService,
    CreditsUtilsService,
    FreeTrialService,
    GenerationBillingService,
    GenerationHoldRecoveryService,
    GenerationQuoteGroupService,
    GenerationLineReservationService,
    VideoGenerationLineageService,
    WorkflowGenerationBillingService,
  ],
  imports: [
    BillingAccountsModule,
    ActivityRecordingModule,
    ApiKeyHelperModule,
    ByokModule,
    CommonModule,
    // FreeTrialService reads FREE_TRIAL_ROLLOUT_AT.
    ConfigModule,
    CreditDeductionModule,
    MediaGenerationReceiptsModule,
    NotificationsPublisherModule,
    OrganizationSettingsModule,
    ServerFunnelCaptureModule,
    HttpModule,

    TransactionModule,
  ],
  providers: [
    OnboardingCreditGrantsService,
    OnboardingTrialCreditsListener,
    CreditBalanceService,
    CreditReservationService,
    CreditTransactionsService,
    FreeTrialService,
    GenerationBillingService,
    GenerationHoldRecoveryService,
    GenerationQuoteGroupService,
    GenerationLineReservationService,
    VideoGenerationLineageService,
    WorkflowGenerationBillingService,
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
