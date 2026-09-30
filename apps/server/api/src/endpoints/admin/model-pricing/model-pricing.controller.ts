import { SuperAdminGuard } from '@api/common/guards/super-admin.guard';
import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import { AdminModelPricingService } from '@api/endpoints/admin/model-pricing/model-pricing.service';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { RateLimit } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import { ModelPricingReportSerializer } from '@genfeedai/serializers';
import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';

@Controller('admin/model-pricing')
@UseGuards(IpWhitelistGuard, SuperAdminGuard)
export class AdminModelPricingController {
  constructor(private readonly pricing: AdminModelPricingService) {}

  @Get()
  @RateLimit({ limit: 30, scope: 'user', windowMs: 60_000 })
  async getReport(@Req() request: Request) {
    const source = `${request.protocol}://${request.get('host')}${request.originalUrl.split('?')[0]}`;
    return serializeSingle(
      request,
      ModelPricingReportSerializer,
      await this.pricing.getReport(source),
    );
  }
}
