import { SuperAdminGuard } from '@api/common/guards/super-admin.guard';
import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import { OrganizationAppsReportService } from '@api/endpoints/admin/organization-apps-report/organization-apps-report.service';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { RateLimit } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import { OrganizationAppsReportSerializer } from '@genfeedai/serializers';
import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@ApiTags('Admin / Organization Apps')
@Controller('admin/organization-apps')
@UseGuards(IpWhitelistGuard, SuperAdminGuard)
export class OrganizationAppsReportController {
  constructor(private readonly reportService: OrganizationAppsReportService) {}

  @Get()
  @RateLimit({ limit: 30, scope: 'user', windowMs: 60_000 })
  @ApiOperation({
    summary:
      'Read-only report of the apps each organization sees, with release flags and per-organization switches',
  })
  async getReport(@Req() request: Request) {
    const report = await this.reportService.getReport();
    return serializeSingle(request, OrganizationAppsReportSerializer, report);
  }
}
