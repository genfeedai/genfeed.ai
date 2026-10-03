import { CreditsModule } from '@api/collections/credits/credits.module';
import { SuperAdminGuard } from '@api/common/guards/super-admin.guard';
import { AdminCreditHoldsController } from '@api/endpoints/admin/credit-holds/credit-holds.controller';
import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import { Module } from '@nestjs/common';
@Module({
  controllers: [AdminCreditHoldsController],
  imports: [CreditsModule],
  providers: [IpWhitelistGuard, SuperAdminGuard],
})
export class AdminCreditHoldsModule {}
