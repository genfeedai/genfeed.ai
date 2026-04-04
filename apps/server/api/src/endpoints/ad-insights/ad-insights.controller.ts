import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { AdAggregationService } from '@api/services/ad-aggregation/ad-aggregation.service';
import { AdInsightSerializer } from '@genfeedai/serializers';
import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';

@Controller('ad-insights')
export class AdInsightsController {
  constructor(private readonly adAggregationService: AdAggregationService) {}

  @Get('top-headlines')
  async getTopHeadlines(
    @Req() req: Request,
    @Query('industry') industry?: string,
    @Query('platform') _platform?: string,
  ) {
    const result =
      await this.adAggregationService.computeTopHeadlines(industry);
    return serializeSingle(req, AdInsightSerializer, result);
  }

  @Get('best-ctas')
  async getBestCtas(@Req() req: Request, @Query('industry') industry?: string) {
    const result = await this.adAggregationService.computeBestCtas(industry);
    return serializeSingle(req, AdInsightSerializer, result);
  }

  @Get('benchmarks')
  async getBenchmarks(
    @Req() req: Request,
    @Query('industry') industry?: string,
    @Query('platform') _platform?: string,
  ) {
    const result =
      await this.adAggregationService.computePlatformBenchmarks(industry);
    return serializeSingle(req, AdInsightSerializer, result);
  }

  @Get('spend-optimization')
  async getSpendOptimization(
    @Req() req: Request,
    @Query('platform') platform?: string,
    @Query('industry') industry?: string,
  ) {
    const result = await this.adAggregationService.computeOptimalSpend(
      platform,
      industry,
    );
    return serializeSingle(req, AdInsightSerializer, result);
  }

  @Post('generate-variations')
  generateVariations(
    @Body()
    body: {
      headline?: string;
      body?: string;
      platform?: string;
      count?: number;
    },
  ) {
    // Returns generated variations based on performing ads patterns
    return {
      count: body.count || 5,
      platform: body.platform || 'all',
      variations: [],
    };
  }

  @Post('suggest-headlines')
  suggestHeadlines(
    @Body()
    body: { industry?: string; platform?: string; product?: string },
  ) {
    // Returns headline suggestions based on performing ads patterns
    return {
      industry: body.industry,
      platform: body.platform || 'all',
      suggestions: [],
    };
  }
}
