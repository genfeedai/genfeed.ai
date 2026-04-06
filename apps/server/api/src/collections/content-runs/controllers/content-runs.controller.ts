import { ContentRunsService } from '@api/collections/content-runs/services/content-runs.service';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import type { User } from '@clerk/backend';
import { ContentRunStatus } from '@genfeedai/enums';
import { ContentRunSerializer } from '@genfeedai/serializers';
import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import { ApiQuery } from '@nestjs/swagger';
import type { Request } from 'express';

@Controller()
export class ContentRunsController {
  constructor(private readonly contentRunsService: ContentRunsService) {}

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
}
