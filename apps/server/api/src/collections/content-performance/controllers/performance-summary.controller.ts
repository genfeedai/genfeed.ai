import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { PerformanceSummaryService } from '@api/collections/content-performance/services/performance-summary.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { isEntityId } from '@api/helpers/validation/entity-id.validator';
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

const MAX_SUMMARY_LIMIT = 50;

function validateBrandId(brandId: string): void {
  if (!isEntityId(brandId)) {
    throw new BadRequestException(
      'brandId is required and must be a valid entity id',
    );
  }
}

/** Parses and clamps a client-supplied count query param to [1, MAX_SUMMARY_LIMIT]. */
function clampSummaryLimit(value: string): number | undefined {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }

  return Math.max(1, Math.min(MAX_SUMMARY_LIMIT, parsed));
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
    const organization = user.organizationId;
    const summary = await this.performanceSummaryService.getWeeklySummary(
      organization,
      brandId,
      {
        endDate: endDate || undefined,
        startDate: startDate || undefined,
        topN: topN ? clampSummaryLimit(topN) : undefined,
        worstN: worstN ? clampSummaryLimit(worstN) : undefined,
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
    const organization = user.organizationId;
    return await this.performanceSummaryService.getTopPerformers(
      organization,
      brandId,
      limit ? (clampSummaryLimit(limit) ?? 10) : 10,
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
    const organization = user.organizationId;
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
    const organization = user.organizationId;
    const context =
      await this.performanceSummaryService.generatePerformanceContext(
        organization,
        brandId,
      );
    return { context };
  }
}
