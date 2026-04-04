import { PerformanceSummaryService } from '@api/collections/content-performance/services/performance-summary.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import type { User } from '@clerk/backend';
import { PerformanceSummarySerializer } from '@genfeedai/serializers';
import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

function validateBrandId(brandId: string): void {
  if (!brandId || !/^[a-fA-F0-9]{24}$/.test(brandId)) {
    throw new BadRequestException(
      'brandId is required and must be a valid 24-character ObjectId',
    );
  }
}

@AutoSwagger()
@ApiTags('Content Performance')
@Controller('content-performance/summary')
@UseGuards(RolesGuard)
export class PerformanceSummaryController {
  constructor(
    private readonly performanceSummaryService: PerformanceSummaryService,
  ) {}

  /**
   * Get weekly performance summary including top/worst content,
   * platform breakdown, posting time analysis, and trends.
   */
  @Get('weekly')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getWeeklySummary(
    @Req() req: Request,
    @Query('brandId') brandId: string,
    @Query('topN') topN: string,
    @Query('worstN') worstN: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @CurrentUser() user: User,
  ) {
    validateBrandId(brandId);
    const { organization } = getPublicMetadata(user);
    const summary = await this.performanceSummaryService.getWeeklySummary(
      organization,
      brandId,
      {
        endDate: endDate || undefined,
        startDate: startDate || undefined,
        topN: topN ? parseInt(topN, 10) : undefined,
        worstN: worstN ? parseInt(worstN, 10) : undefined,
      },
    );
    return serializeSingle(req, PerformanceSummarySerializer, summary);
  }

  /**
   * Get top N performing content ranked by engagement rate.
   */
  @Get('top-performers')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getTopPerformers(
    @Query('brandId') brandId: string,
    @Query('limit') limit: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @CurrentUser() user: User,
  ) {
    validateBrandId(brandId);
    const { organization } = getPublicMetadata(user);
    return await this.performanceSummaryService.getTopPerformers(
      organization,
      brandId,
      limit ? parseInt(limit, 10) : 10,
      {
        endDate: endDate || undefined,
        startDate: startDate || undefined,
      },
    );
  }

  /**
   * Get prompt/content performance rankings — which descriptions produce the best results.
   */
  @Get('prompt-performance')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getPromptPerformance(
    @Query('brandId') brandId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @CurrentUser() user: User,
  ) {
    validateBrandId(brandId);
    const { organization } = getPublicMetadata(user);
    return await this.performanceSummaryService.getPromptPerformance(
      organization,
      brandId,
      startDate || undefined,
      endDate || undefined,
    );
  }

  /**
   * Get a text block of performance context for injection into AI generation prompts.
   */
  @Get('generation-context')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getGenerationContext(
    @Query('brandId') brandId: string,
    @CurrentUser() user: User,
  ) {
    validateBrandId(brandId);
    const { organization } = getPublicMetadata(user);
    const context =
      await this.performanceSummaryService.generatePerformanceContext(
        organization,
        brandId,
      );
    return { context };
  }
}
