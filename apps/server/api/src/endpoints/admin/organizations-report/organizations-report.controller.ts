import { SuperAdminGuard } from '@api/common/guards/super-admin.guard';
import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import { OrganizationsReportQueryDto } from '@api/endpoints/admin/organizations-report/dto/organizations-report-query.dto';
import { OrganizationsReportService } from '@api/endpoints/admin/organizations-report/organizations-report.service';
import { resolvePageWindow } from '@api/helpers/dto/pagination-query.dto';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { RateLimit } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import { OrganizationsReportSerializer } from '@genfeedai/serializers';
import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@ApiTags('Admin / Organizations')
@Controller('admin/organizations')
@UseGuards(IpWhitelistGuard, SuperAdminGuard)
export class OrganizationsReportController {
  constructor(private readonly reportService: OrganizationsReportService) {}

  @Get()
  @RateLimit({ limit: 30, scope: 'user', windowMs: 60_000 })
  @ApiOperation({
    summary:
      'Read-only list of every organization with owner, tier, category and member count',
  })
  async getReport(
    @Req() request: Request,
    @Query() query: OrganizationsReportQueryDto,
  ) {
    const report = await this.reportService.getReport(
      resolvePageWindow(query),
      query.includeDeleted === true,
    );
    return serializeSingle(request, OrganizationsReportSerializer, report);
  }
}
