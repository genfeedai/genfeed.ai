import { SuperAdminGuard } from '@api/common/guards/super-admin.guard';
import { EconomicsQueryDto } from '@api/endpoints/admin/economics/dto/economics-query.dto';
import { EconomicsService } from '@api/endpoints/admin/economics/economics.service';
import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { RateLimit } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import {
  EconomicsCostReportSerializer,
  EconomicsCoverageReportSerializer,
  EconomicsOverviewReportSerializer,
  EconomicsRevenueReportSerializer,
} from '@genfeedai/serializers';
import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@ApiTags('Admin / Economics')
@Controller('admin/economics')
@UseGuards(IpWhitelistGuard, SuperAdminGuard)
export class EconomicsController {
  constructor(private readonly economicsService: EconomicsService) {}

  @Get('overview')
  @RateLimit({ limit: 30, scope: 'user', windowMs: 60_000 })
  @ApiOperation({
    summary:
      'Revenue, provider cost, credits and both margins, with a daily series and the previous period',
  })
  async getOverview(
    @Req() request: Request,
    @Query() query: EconomicsQueryDto,
  ) {
    const report = await this.economicsService.getOverview(query);
    return serializeSingle(request, EconomicsOverviewReportSerializer, report);
  }

  @Get('revenue')
  @RateLimit({ limit: 30, scope: 'user', windowMs: 60_000 })
  @ApiOperation({
    summary:
      'Stripe revenue by day and source, top organizations and the latest payments',
  })
  async getRevenue(@Req() request: Request, @Query() query: EconomicsQueryDto) {
    const report = await this.economicsService.getRevenue(query);
    return serializeSingle(request, EconomicsRevenueReportSerializer, report);
  }

  @Get('costs')
  @RateLimit({ limit: 30, scope: 'user', windowMs: 60_000 })
  @ApiOperation({
    summary: 'LLM and generation provider cost by day, model and category',
  })
  async getCosts(@Req() request: Request, @Query() query: EconomicsQueryDto) {
    const report = await this.economicsService.getCosts(query);
    return serializeSingle(request, EconomicsCostReportSerializer, report);
  }

  @Get('coverage')
  @RateLimit({ limit: 30, scope: 'user', windowMs: 60_000 })
  @ApiOperation({
    summary:
      'Ledger freshness and credits spent per operation next to the provider cost recorded for it',
  })
  async getCoverage(
    @Req() request: Request,
    @Query() query: EconomicsQueryDto,
  ) {
    const report = await this.economicsService.getCoverage(query);
    return serializeSingle(request, EconomicsCoverageReportSerializer, report);
  }
}
