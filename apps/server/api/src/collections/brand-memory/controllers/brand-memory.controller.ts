import { BrandMemoryService } from '@api/collections/brand-memory/services/brand-memory.service';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import { serializeCollection } from '@api/helpers/utils/response/response.util';
import type { User } from '@clerk/backend';
import { BrandMemorySerializer } from '@genfeedai/serializers';
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
    const { organization: organizationId } = getPublicMetadata(user);

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
    const { organization: organizationId } = getPublicMetadata(user);

    const docs = await this.brandMemoryService.getInsights(
      organizationId,
      brandId,
      limit ? Number(limit) : 20,
    );
    return serializeCollection(req, BrandMemorySerializer, { docs });
  }

  @Post('distill')
  async distillMemory(
    @Param('brandId') brandId: string,
    @CurrentUser() user: User,
  ) {
    const { organization: organizationId } = getPublicMetadata(user);

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
