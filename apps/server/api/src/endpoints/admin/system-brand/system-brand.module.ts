import { BrandsCoreModule } from '@api/collections/brands/brands-core.module';
import { SuperAdminGuard } from '@api/common/guards/super-admin.guard';
import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import { SystemBrandController } from '@api/endpoints/admin/system-brand/system-brand.controller';
import { Module } from '@nestjs/common';

@Module({
  controllers: [SystemBrandController],
  imports: [BrandsCoreModule],
  providers: [IpWhitelistGuard, SuperAdminGuard],
})
export class AdminSystemBrandModule {}
