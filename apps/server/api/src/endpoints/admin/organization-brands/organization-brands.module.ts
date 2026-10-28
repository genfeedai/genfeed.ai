import { BrandsCoreModule } from '@api/collections/brands/brands-core.module';
import { SuperAdminGuard } from '@api/common/guards/super-admin.guard';
import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import { AdminOrganizationBrandsController } from '@api/endpoints/admin/organization-brands/organization-brands.controller';
import { SignupPrefillModule } from '@api/services/signup-prefill/signup-prefill.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [AdminOrganizationBrandsController],
  imports: [BrandsCoreModule, SignupPrefillModule],
  providers: [IpWhitelistGuard, SuperAdminGuard],
})
export class AdminOrganizationBrandsModule {}
