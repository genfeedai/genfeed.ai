import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { AbTestSuggestionHarnessService } from '@api/services/content-optimization/ab-test-suggestion-harness.service';
import {
  type AnalyzePerformanceOptions,
  ContentOptimizationService,
} from '@api/services/content-optimization/content-optimization.service';
import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';

export class AutoApplySuggestionDto {
  @IsString()
  suggestionId!: string;
}

export class OptimizePromptDto {
  @IsString()
  prompt!: string;
}

export class ExecuteAbTestSuggestionDto {
  @IsString()
  hypothesis!: string;

  @IsString()
  platform!: string;

  @IsOptional()
  @IsString()
  suggestionId?: string;

  @IsString()
  variable!: string;

  @IsString()
  variantA!: string;

  @IsString()
  variantB!: string;
}

@Controller('brands/:brandId/optimization')
export class ContentOptimizationController {
  constructor(
    private readonly contentOptimizationService: ContentOptimizationService,
    private readonly abTestHarness: AbTestSuggestionHarnessService,
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
    const organizationId = user.organizationId;

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
    @Body() body: OptimizePromptDto,
  ) {
    const organizationId = user.organizationId;

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
    const organizationId = user.organizationId;

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
    const organizationId = user.organizationId;

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
    const organizationId = user.organizationId;

    return this.contentOptimizationService.autoApplySuggestion(
      organizationId,
      brandId,
      body.suggestionId,
    );
  }

  /**
   * POST v1/brands/:brandId/optimization/ab-tests
   * Turns an advisory A/B suggestion into attributed variation arms.
   */
  @Post('ab-tests')
  async executeAbTest(
    @Param('brandId') brandId: string,
    @CurrentUser() user: User,
    @Body() body: ExecuteAbTestSuggestionDto,
  ) {
    return this.abTestHarness.executeSuggestion({
      brandId,
      organizationId: user.organizationId,
      suggestion: {
        hypothesis: body.hypothesis,
        platform: body.platform,
        ...(body.suggestionId ? { suggestionId: body.suggestionId } : {}),
        variable: body.variable,
        variantA: body.variantA,
        variantB: body.variantB,
      },
      userId: user.userId ?? user.id,
    });
  }

  /**
   * POST v1/brands/:brandId/optimization/ab-tests/resolve
   * Scores published A/B arms and persists resolved outcomes only.
   */
  @Post('ab-tests/resolve')
  async resolveAbTests(
    @Param('brandId') brandId: string,
    @CurrentUser() user: User,
  ) {
    return this.abTestHarness.resolveOutcomes(user.organizationId, brandId);
  }
}
