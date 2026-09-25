import { SuperAdminGuard } from '@api/common/guards/super-admin.guard';
import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import { UnitEconomicsQueryDto } from '@api/endpoints/admin/unit-economics/dto/unit-economics-query.dto';
import { UnitEconomicsService } from '@api/endpoints/admin/unit-economics/unit-economics.service';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { RateLimit } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import { UnitEconomicsReportSerializer } from '@genfeedai/serializers';
import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@ApiTags('Admin / Unit Economics')
@Controller('admin/unit-economics')
@UseGuards(IpWhitelistGuard, SuperAdminGuard)
export class UnitEconomicsController {
  constructor(private readonly unitEconomicsService: UnitEconomicsService) {}

  @Get()
  @RateLimit({ limit: 30, scope: 'user', windowMs: 60_000 })
  @ApiOperation({
    summary:
      'Revenue, credits consumed, provider cost, and gross margin per organization (or per user with organizationId)',
  })
  async getReport(
    @Req() request: Request,
    @Query() query: UnitEconomicsQueryDto,
  ) {
    const report = await this.unitEconomicsService.getReport(query);
    return serializeSingle(request, UnitEconomicsReportSerializer, report);
  }
}
