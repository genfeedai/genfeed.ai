/**
 * Credits Module
 * Usage credits system: track AI generation credits, manage credit packages,
and enforce usage limits.
 */
import { CreditsController } from '@api/collections/credits/controllers/credits.controller';
import { CreditBalanceService } from '@api/collections/credits/services/credit-balance.service';
import { CreditTransactionsService } from '@api/collections/credits/services/credit-transactions.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { TopbarBalancesService } from '@api/collections/credits/services/topbar-balances.service';
import { OrganizationSettingsModule } from '@api/collections/organization-settings/organization-settings.module';
import { CommonModule } from '@api/common/common.module';
import { OssCreditsUtilsService } from '@api/common/credits/oss-credits-utils.service';
import { TransactionModule } from '@api/helpers/utils/transaction/transaction.module';
import { CreditDeductionModule } from '@api/queues/credit-deduction/credit-deduction.module';
import { ByokModule } from '@api/services/byok/byok.module';
import { ClerkModule } from '@api/services/integrations/clerk/clerk.module';
import { NotificationsPublisherModule } from '@api/services/notifications/publisher/notifications-publisher.module';
import { isEEEnabled } from '@genfeedai/config';
import { HttpModule } from '@nestjs/axios';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [CreditsController],
  exports: [
    CreditBalanceService,
    forwardRef(() => CreditDeductionModule),
    CreditTransactionsService,
    CreditsUtilsService,
  ],
  imports: [
    forwardRef(() => ByokModule),
    forwardRef(() => ClerkModule),
    forwardRef(() => CommonModule),
    forwardRef(() => CreditDeductionModule),
    forwardRef(() => NotificationsPublisherModule),
    forwardRef(() => OrganizationSettingsModule),
    forwardRef(() => HttpModule),

    forwardRef(() => TransactionModule),
  ],
  providers: [
    CreditBalanceService,
    CreditTransactionsService,
    {
      provide: CreditsUtilsService,
      useClass: isEEEnabled() ? CreditsUtilsService : OssCreditsUtilsService,
    },
    TopbarBalancesService,
  ],
})
export class CreditsModule {}
