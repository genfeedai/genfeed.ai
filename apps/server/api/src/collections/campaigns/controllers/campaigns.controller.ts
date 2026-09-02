import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import {
  CampaignPostsDto,
  RestoreCampaignDto,
} from '@api/collections/campaigns/dto/campaign-action.dto';
import { CampaignsQueryDto } from '@api/collections/campaigns/dto/campaigns-query.dto';
import { CreateCampaignDto } from '@api/collections/campaigns/dto/create-campaign.dto';
import { UpdateCampaignDto } from '@api/collections/campaigns/dto/update-campaign.dto';
import { CampaignsService } from '@api/collections/campaigns/services/campaigns.service';
import { RequiredScopes } from '@api/helpers/decorators/scopes/required-scopes.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { API_KEY_POSTING_CONFIGURATION_SCOPES } from '@api/helpers/utils/auth/api-key-publishing-scope.util';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { CampaignSerializer } from '@genfeedai/serializers';
import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@AutoSwagger()
@ApiTags('Campaigns')
@Controller('campaigns')
export class CampaignsController {
  constructor(private readonly service: CampaignsService) {}

  @Get()
  async list(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Query() query: CampaignsQueryDto,
  ) {
    const data = await this.service.list(user.organizationId, query);
    return serializeCollection(request, CampaignSerializer, data);
  }

  @Get(':id')
  async getOne(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ) {
    const data = await this.service.getOne(user.organizationId, id);
    return serializeSingle(request, CampaignSerializer, data);
  }

  @Post()
  @RequiredScopes(...API_KEY_POSTING_CONFIGURATION_SCOPES)
  async create(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() dto: CreateCampaignDto,
  ) {
    const data = await this.service.create(
      user.organizationId,
      this.resolveUserId(user),
      dto,
    );
    return serializeSingle(request, CampaignSerializer, data);
  }

  @Patch(':id')
  @RequiredScopes(...API_KEY_POSTING_CONFIGURATION_SCOPES)
  async update(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: UpdateCampaignDto,
  ) {
    const data = await this.service.update(user.organizationId, id, dto);
    return serializeSingle(request, CampaignSerializer, data);
  }

  @Post(':id/archive')
  @RequiredScopes(...API_KEY_POSTING_CONFIGURATION_SCOPES)
  async archive(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ) {
    const data = await this.service.archive(user.organizationId, id);
    return serializeSingle(request, CampaignSerializer, data);
  }

  @Post(':id/restore')
  @RequiredScopes(...API_KEY_POSTING_CONFIGURATION_SCOPES)
  async restore(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: RestoreCampaignDto,
  ) {
    const data = await this.service.restore(
      user.organizationId,
      id,
      dto.status,
    );
    return serializeSingle(request, CampaignSerializer, data);
  }

  @Post(':id/posts')
  @RequiredScopes(...API_KEY_POSTING_CONFIGURATION_SCOPES)
  async assignPosts(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: CampaignPostsDto,
  ) {
    const data = await this.service.assignPosts(user.organizationId, id, dto);
    return serializeSingle(request, CampaignSerializer, data);
  }

  @Delete(':id/posts')
  @RequiredScopes(...API_KEY_POSTING_CONFIGURATION_SCOPES)
  async unassignPosts(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: CampaignPostsDto,
  ) {
    const data = await this.service.unassignPosts(user.organizationId, id, dto);
    return serializeSingle(request, CampaignSerializer, data);
  }

  @Delete(':id')
  @RequiredScopes(...API_KEY_POSTING_CONFIGURATION_SCOPES)
  async remove(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ) {
    const data = await this.service.remove(user.organizationId, id);
    return serializeSingle(request, CampaignSerializer, data);
  }

  /**
   * Better Auth user ids are opaque strings spanning legacy base62 values and
   * UUIDs — never entity ids — so ownership is stamped from the session.
   */
  private resolveUserId(user: User): string {
    const userId = user.userId ?? user.id;
    if (!userId) {
      throw new ForbiddenException('A user is required');
    }
    return userId;
  }
}
