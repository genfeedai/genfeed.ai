import { SuperAdminGuard } from '@api/common/guards/super-admin.guard';
import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import { OrganizationsReportController } from '@api/endpoints/admin/organizations-report/organizations-report.controller';
import { OrganizationsReportService } from '@api/endpoints/admin/organizations-report/organizations-report.service';
import { PrismaModule } from '@api/shared/modules/prisma/prisma.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [OrganizationsReportController],
  imports: [PrismaModule],
  providers: [IpWhitelistGuard, OrganizationsReportService, SuperAdminGuard],
})
export class AdminOrganizationsReportModule {}
