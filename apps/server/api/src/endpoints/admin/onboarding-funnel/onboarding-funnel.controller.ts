import { SuperAdminGuard } from '@api/common/guards/super-admin.guard';
import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import { OnboardingDraftsQueryDto } from '@api/endpoints/admin/onboarding-funnel/dto/onboarding-drafts-query.dto';
import { OnboardingFunnelQueryDto } from '@api/endpoints/admin/onboarding-funnel/dto/onboarding-funnel-query.dto';
import { OnboardingDraftsReviewService } from '@api/endpoints/admin/onboarding-funnel/onboarding-drafts-review.service';
import { OnboardingFunnelService } from '@api/endpoints/admin/onboarding-funnel/onboarding-funnel.service';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { RateLimit } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import {
  OnboardingDraftsReviewSerializer,
  OnboardingFunnelSerializer,
} from '@genfeedai/serializers';
import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@ApiTags('Admin / Onboarding')
@Controller('admin/onboarding-funnel')
@UseGuards(IpWhitelistGuard, SuperAdminGuard)
export class OnboardingFunnelController {
  constructor(
    private readonly funnelService: OnboardingFunnelService,
    private readonly draftsReviewService: OnboardingDraftsReviewService,
  ) {}

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

  @Get('drafts')
  @RateLimit({ limit: 30, scope: 'user', windowMs: 60_000 })
  @ApiOperation({
    summary:
      'Read-only onboarding output: the newest first-run posts of recent organizations, with the "I\'d post this" and "Not for me" verdict on each',
  })
  async getDrafts(
    @Req() request: Request,
    @Query() query: OnboardingDraftsQueryDto,
  ) {
    return serializeSingle(
      request,
      OnboardingDraftsReviewSerializer,
      await this.draftsReviewService.getReview(query.days, query.limit),
    );
  }
}
