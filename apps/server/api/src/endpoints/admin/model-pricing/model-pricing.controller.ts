import { SuperAdminGuard } from '@api/common/guards/super-admin.guard';
import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import { AdminModelPricingService } from '@api/endpoints/admin/model-pricing/model-pricing.service';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { RateLimit } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import { ModelPricingReportSerializer } from '@genfeedai/serializers';
import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';

const modelIdSchema = z.string().trim().min(1).max(200);

@Controller('admin/model-pricing')
@UseGuards(IpWhitelistGuard, SuperAdminGuard)
export class AdminModelPricingController {
  constructor(private readonly pricing: AdminModelPricingService) {}

  @Get()
  @RateLimit({ limit: 30, scope: 'user', windowMs: 60_000 })
  async getReport(@Req() request: Request) {
    return serializeSingle(
      request,
      ModelPricingReportSerializer,
      await this.pricing.getReport(this.reportSource(request)),
    );
  }

  /**
   * Promote a provider's pending rates to the reviewed contract (#6196). Under
   * the same superadmin and IP allowlist guards as the report; returns the
   * refreshed report.
   */
  @Post(':modelId/approve-rates')
  @RateLimit({ limit: 10, scope: 'user', windowMs: 60_000 })
  async approveRates(
    @Req() request: Request,
    @Param('modelId') modelId: string,
  ) {
    if (!modelIdSchema.safeParse(modelId).success)
      throw new BadRequestException('Invalid identifier');
    const approvedBy = request.context?.userId;
    if (!approvedBy) throw new UnauthorizedException();
    await this.pricing.approveRates(modelId, approvedBy);
    return serializeSingle(
      request,
      ModelPricingReportSerializer,
      await this.pricing.getReport(
        this.reportSource(request).replace(/\/[^/]+\/approve-rates$/, ''),
      ),
    );
  }

  private reportSource(request: Request): string {
    return `${request.protocol}://${request.get('host')}${request.originalUrl.split('?')[0]}`;
  }
}
