import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import {
  type AnalyzePerformanceOptions,
  ContentOptimizationService,
} from '@api/services/content-optimization/content-optimization.service';
import { ContentOptimizationQueueService } from '@api/services/content-optimization/content-optimization-queue.service';
import type { User } from '@clerk/backend';
import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { IsString } from 'class-validator';

export class AutoApplySuggestionDto {
  @IsString()
  suggestionId!: string;
}

@Controller('brands/:brandId/optimization')
export class ContentOptimizationController {
  constructor(
    private readonly contentOptimizationService: ContentOptimizationService,
    private readonly queueService: ContentOptimizationQueueService,
  ) {}

  /**
   * GET v1/brands/:brandId/optimization/analysis
   * Returns performance analysis with insights.
   */
  @Get('analysis')
  async getAnalysis(
    @Param('brandId') brandId: string,
    @CurrentUser() user: User,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('topN') topN?: string,
  ) {
    const { organization: organizationId } = getPublicMetadata(user);

    const options: AnalyzePerformanceOptions = {
      endDate,
      startDate,
      topN: topN ? Number(topN) : undefined,
    };

    return this.contentOptimizationService.analyzePerformance(
      organizationId,
      brandId,
      options,
    );
  }

  /**
   * POST v1/brands/:brandId/optimization/optimize-prompt
   * Optimizes a content prompt based on performance data.
   */
  @Post('optimize-prompt')
  async optimizePrompt(
    @Param('brandId') brandId: string,
    @CurrentUser() user: User,
    @Body() body: { prompt: string },
  ) {
    const { organization: organizationId } = getPublicMetadata(user);

    return this.contentOptimizationService.optimizePrompt(
      organizationId,
      brandId,
      body.prompt,
    );
  }

  /**
   * GET v1/brands/:brandId/optimization/recommendations
   * Returns actionable recommendations.
   */
  @Get('recommendations')
  async getRecommendations(
    @Param('brandId') brandId: string,
    @CurrentUser() user: User,
  ) {
    const { organization: organizationId } = getPublicMetadata(user);

    return this.contentOptimizationService.getRecommendations(
      organizationId,
      brandId,
    );
  }

  /**
   * GET v1/brands/:brandId/optimization/suggestions
   * Returns memory-driven optimization suggestions.
   */
  @Get('suggestions')
  async getSuggestions(
    @Param('brandId') brandId: string,
    @CurrentUser() user: User,
  ) {
    const { organization: organizationId } = getPublicMetadata(user);

    return this.contentOptimizationService.generateSuggestions(
      organizationId,
      brandId,
    );
  }

  /**
   * POST v1/brands/:brandId/optimization/suggestions/auto-apply
   * Auto-applies a specific suggestion when confidence threshold passes.
   */
  @Post('suggestions/auto-apply')
  async autoApplySuggestion(
    @Param('brandId') brandId: string,
    @CurrentUser() user: User,
    @Body() body: AutoApplySuggestionDto,
  ) {
    const { organization: organizationId } = getPublicMetadata(user);

    return this.contentOptimizationService.autoApplySuggestion(
      organizationId,
      brandId,
      body.suggestionId,
    );
  }

  /**
   * POST v1/brands/:brandId/optimization/trigger
   * Triggers an async optimization run via BullMQ.
   */
  @Post('trigger')
  async triggerOptimization(
    @Param('brandId') brandId: string,
    @CurrentUser() user: User,
  ) {
    const { organization: organizationId } = getPublicMetadata(user);

    const jobId = await this.queueService.queueAnalysis(
      organizationId,
      brandId,
    );

    return { jobId, status: 'queued' };
  }
}
