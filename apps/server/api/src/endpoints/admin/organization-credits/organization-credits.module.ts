import { CreditsModule } from '@api/collections/credits/credits.module';
import { SuperAdminGuard } from '@api/common/guards/super-admin.guard';
import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import { AdminOrganizationCreditsController } from '@api/endpoints/admin/organization-credits/organization-credits.controller';
import { Module } from '@nestjs/common';

@Module({
  controllers: [AdminOrganizationCreditsController],
  imports: [CreditsModule],
  providers: [IpWhitelistGuard, SuperAdminGuard],
})
export class AdminOrganizationCreditsModule {}
