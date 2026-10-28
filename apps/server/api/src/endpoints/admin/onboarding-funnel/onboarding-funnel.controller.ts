import { SuperAdminGuard } from '@api/common/guards/super-admin.guard';
import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import { OnboardingFunnelQueryDto } from '@api/endpoints/admin/onboarding-funnel/dto/onboarding-funnel-query.dto';
import { OnboardingFunnelService } from '@api/endpoints/admin/onboarding-funnel/onboarding-funnel.service';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { RateLimit } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import { OnboardingFunnelSerializer } from '@genfeedai/serializers';
import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@ApiTags('Admin / Onboarding')
@Controller('admin/onboarding-funnel')
@UseGuards(IpWhitelistGuard, SuperAdminGuard)
export class OnboardingFunnelController {
  constructor(private readonly funnelService: OnboardingFunnelService) {}

  @Get()
  @RateLimit({ limit: 30, scope: 'user', windowMs: 60_000 })
  @ApiOperation({
    summary:
      'Read-only onboarding funnel: how recent organizations moved through each step, by owner email class',
  })
  async getReport(
    @Req() request: Request,
    @Query() query: OnboardingFunnelQueryDto,
  ) {
    return serializeSingle(
      request,
      OnboardingFunnelSerializer,
      await this.funnelService.getReport(query.days),
    );
  }
}
