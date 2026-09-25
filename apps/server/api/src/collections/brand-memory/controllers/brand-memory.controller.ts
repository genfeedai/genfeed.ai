import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandMemoryService } from '@api/collections/brand-memory/services/brand-memory.service';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { serializeCollection } from '@api/helpers/utils/response/response.util';
import {
  BrandMemoryInsightSerializer,
  BrandMemorySerializer,
} from '@genfeedai/serializers';
import { Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';

@Controller('brands/:brandId/memory')
export class BrandMemoryController {
  constructor(private readonly brandMemoryService: BrandMemoryService) {}

  @Get()
  async getMemory(
    @Req() req: Request,
    @Param('brandId') brandId: string,
    @CurrentUser() user: User,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const organizationId = user.organizationId;

    const docs = await this.brandMemoryService.getMemory(
      organizationId,
      brandId,
      {
        from: from ? new Date(from) : undefined,
        to: to ? new Date(to) : undefined,
      },
    );
    return serializeCollection(req, BrandMemorySerializer, { docs });
  }

  @Get('insights')
  async getInsights(
    @Req() req: Request,
    @Param('brandId') brandId: string,
    @CurrentUser() user: User,
    @Query('limit') limit?: string,
  ) {
    const organizationId = user.organizationId;

    const parsedLimit = limit ? Number(limit) : 20;
    const insights = await this.brandMemoryService.getInsights(
      organizationId,
      brandId,
      Number.isFinite(parsedLimit)
        ? Math.min(Math.max(parsedLimit, 1), 100)
        : 20,
    );
    // Insights live inside BrandMemory rows and carry no id of their own; the
    // response id is their position in this newest-first list.
    const docs = insights.map((insight, index) => ({
      ...insight,
      id: `${brandId}:insight:${index}`,
    }));
    return serializeCollection(req, BrandMemoryInsightSerializer, { docs });
  }

  @Post('distill')
  async distillMemory(
    @Param('brandId') brandId: string,
    @CurrentUser() user: User,
  ) {
    const organizationId = user.organizationId;

    const insights = await this.brandMemoryService.distillLongTermMemory(
      organizationId,
      brandId,
    );

    return {
      insights,
      status: 'completed',
    };
  }
}
