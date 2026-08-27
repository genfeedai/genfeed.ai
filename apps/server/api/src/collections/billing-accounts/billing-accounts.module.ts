import { BillingAccountsController } from '@api/collections/billing-accounts/controllers/billing-accounts.controller';
import { BillingAccountMigrationService } from '@api/collections/billing-accounts/services/billing-account-migration.service';
import { BillingAccountsService } from '@api/collections/billing-accounts/services/billing-accounts.service';
import { Module } from '@nestjs/common';

@Module({
  controllers: [BillingAccountsController],
  exports: [BillingAccountsService, BillingAccountMigrationService],
  providers: [BillingAccountsService, BillingAccountMigrationService],
})
export class BillingAccountsModule {}
