import { ApiKeysModule } from '@api/collections/api-keys/api-keys.module';
import { SuperAdminGuard } from '@api/common/guards/super-admin.guard';
import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import { AdminOrganizationApiKeysController } from '@api/endpoints/admin/organization-api-keys/organization-api-keys.controller';
import { AdminOrganizationApiKeysService } from '@api/endpoints/admin/organization-api-keys/organization-api-keys.service';
import { PrismaModule } from '@api/shared/modules/prisma/prisma.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [AdminOrganizationApiKeysController],
  imports: [ApiKeysModule, PrismaModule],
  providers: [
    AdminOrganizationApiKeysService,
    IpWhitelistGuard,
    SuperAdminGuard,
  ],
})
export class AdminOrganizationApiKeysModule {}
