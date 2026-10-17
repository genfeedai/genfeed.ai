import { PlatformSettingsModule } from '@api/collections/platform-settings/platform-settings.module';
import { SuperAdminGuard } from '@api/common/guards/super-admin.guard';
import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import { OrganizationAppsReportController } from '@api/endpoints/admin/organization-apps-report/organization-apps-report.controller';
import { OrganizationAppsReportService } from '@api/endpoints/admin/organization-apps-report/organization-apps-report.service';
import { PrismaModule } from '@api/shared/modules/prisma/prisma.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [OrganizationAppsReportController],
  imports: [PlatformSettingsModule, PrismaModule],
  providers: [IpWhitelistGuard, OrganizationAppsReportService, SuperAdminGuard],
})
export class AdminOrganizationAppsReportModule {}
