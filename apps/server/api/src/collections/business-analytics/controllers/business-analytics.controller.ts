import { RedisCacheInterceptor } from '@api/cache/redis/redis-cache.interceptor';
import { BusinessAnalyticsQueryDto } from '@api/collections/business-analytics/dto/business-analytics-query.dto';
import { BusinessAnalyticsService } from '@api/collections/business-analytics/services/business-analytics.service';
import { SuperAdminGuard } from '@api/common/guards/super-admin.guard';
import { Cache } from '@api/helpers/decorators/cache/cache.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { BusinessAnalyticsSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import {
  Controller,
  Get,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';

@AutoSwagger()
@Controller('analytics/business')
@UseGuards(SuperAdminGuard)
@UseInterceptors(RedisCacheInterceptor)
export class BusinessAnalyticsController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly businessAnalyticsService: BusinessAnalyticsService,
    private readonly loggerService: LoggerService,
  ) {}

  @Get()
  @Cache({
    keyGenerator: (req) =>
      `analytics:business:${req.query?.startDate || 'default'}:${req.query?.endDate || 'default'}`,
    tags: ['analytics', 'super-admin', 'business'],
    ttl: 300, // Cache for 5 minutes
  })
  async getBusinessAnalytics(
    @Req() req: ExpressRequest,
    @Query() _query: BusinessAnalyticsQueryDto,
  ): Promise<unknown> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(url);

    const data = await this.businessAnalyticsService.getBusinessAnalytics();
    return serializeSingle(req, BusinessAnalyticsSerializer, data);
  }
}
