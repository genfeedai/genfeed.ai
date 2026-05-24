import { CreateIngredientDto } from '@api/collections/ingredients/dto/create-ingredient.dto';
import { CreateVideoDto } from '@api/collections/videos/dto/create-video.dto';
import { VideosService } from '@api/collections/videos/services/videos.service';
import { AnalyticsService } from '@api/endpoints/analytics/analytics.service';
import { Credits } from '@api/helpers/decorators/credits/credits.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import {
  ModelsGuard,
  ValidateModel,
} from '@api/helpers/guards/models/models.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { RateLimit } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import { ActivitySource, ModelCategory } from '@genfeedai/enums';
import { AnalyticSerializer, VideoSerializer } from '@genfeedai/serializers';
import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Request } from 'express';

@AutoSwagger()
@Controller('mcp')
export class MCPController {
  constructor(
    private readonly videosService: VideosService,
    private readonly analyticsService: AnalyticsService,
  ) {}

  @Post('videos')
  @Credits({
    description: 'Video generation',
    source: ActivitySource.VIDEO_GENERATION,
  })
  @ValidateModel({ category: ModelCategory.VIDEO })
  @UseGuards(SubscriptionGuard, CreditsGuard, ModelsGuard)
  @UseInterceptors(CreditsInterceptor)
  @RateLimit({ limit: 5, windowMs: 5 * 60 * 1000 }) // 5 videos per 5 minutes (same as main endpoint)
  async createVideo(
    @Req() request: Request,
    @Body() createVideoDto: CreateVideoDto,
  ) {
    const data = await this.videosService.create(
      createVideoDto as CreateIngredientDto,
    );
    return serializeSingle(request, VideoSerializer, data);
  }

  @Get('analytics')
  async getAnalytics(@Req() request: Request, @Query() query: BaseQueryDto) {
    const options = {
      limit: query.limit,
      page: query.page,
      sort: { createdAt: -1 } as Record<string, 1 | -1>,
    };

    const data = await this.analyticsService.findAll({ where: {} }, options);
    return serializeCollection(request, AnalyticSerializer, data);
  }
}
