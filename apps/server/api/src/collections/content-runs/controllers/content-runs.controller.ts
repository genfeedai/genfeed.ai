import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CreateContentRunBriefDto } from '@api/collections/content-runs/dto/create-content-run-brief.dto';
import { ContentRunRecommendationsService } from '@api/collections/content-runs/services/content-run-recommendations.service';
import { ContentRunsService } from '@api/collections/content-runs/services/content-runs.service';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { getPublicMetadata } from '@api/helpers/utils/auth/auth.util';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { ContentRunStatus } from '@genfeedai/enums';
import { ContentRunSerializer } from '@genfeedai/serializers';
import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { ApiQuery } from '@nestjs/swagger';
import type { Request } from 'express';

@Controller()
export class ContentRunsController {
  constructor(
    private readonly contentRunsService: ContentRunsService,
    private readonly recommendationsService: ContentRunRecommendationsService,
  ) {}

  @Get('brands/:brandId/content-runs')
  @ApiQuery({
    enum: ContentRunStatus,
    enumName: 'ContentRunStatus',
    name: 'status',
    required: false,
  })
  async listBrandRuns(
    @Req() req: Request,
    @Param('brandId') brandId: string,
    @CurrentUser() user: User,
    @Query('skillSlug') skillSlug?: string,
    @Query('status') status?: ContentRunStatus,
  ) {
    const { organization } = getPublicMetadata(user);

    const docs = await this.contentRunsService.listByBrand(
      organization,
      brandId,
      skillSlug,
      status,
    );

    return serializeCollection(req, ContentRunSerializer, { docs });
  }

  @Post('brands/:brandId/content-runs/briefs')
  async createBriefRun(
    @Req() req: Request,
    @Param('brandId') brandId: string,
    @CurrentUser() user: User,
    @Body() body: CreateContentRunBriefDto,
  ) {
    const { organization } = getPublicMetadata(user);

    const data = await this.contentRunsService.createBriefRun(
      organization,
      brandId,
      body,
    );

    return serializeSingle(req, ContentRunSerializer, data);
  }

  @Get('content-runs/:id')
  async getRun(
    @Req() req: Request,
    @Param('id') id: string,
    @CurrentUser() user: User,
  ) {
    const { organization } = getPublicMetadata(user);

    const data = await this.contentRunsService.getRunById(organization, id);

    return serializeSingle(req, ContentRunSerializer, data);
  }

  @Post('content-runs/:id/recommendations')
  async analyzeRunRecommendations(
    @Req() req: Request,
    @Param('id') id: string,
    @CurrentUser() user: User,
  ) {
    const { organization } = getPublicMetadata(user);

    const result = await this.recommendationsService.analyzeRun(
      organization,
      id,
    );

    return serializeSingle(req, ContentRunSerializer, result.updatedRun);
  }

  @Post('content-runs/:id/remix-pack')
  async createRemixPack(
    @Req() req: Request,
    @Param('id') id: string,
    @CurrentUser() user: User,
  ) {
    const { organization } = getPublicMetadata(user);

    const data = await this.contentRunsService.createRemixPack(
      organization,
      id,
    );

    return serializeSingle(req, ContentRunSerializer, data);
  }
}
