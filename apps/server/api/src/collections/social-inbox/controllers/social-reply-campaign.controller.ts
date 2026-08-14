import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import {
  SocialReplyCampaignCreateDto,
  SocialReplyCampaignQueryDto,
  SocialReplyCampaignRecipientQueryDto,
  SocialReplyCampaignStatusDto,
  SocialReplyCampaignUpdateDto,
} from '@api/collections/social-inbox/dto/social-reply-campaign.dto';
import type { SocialInboxScope } from '@api/collections/social-inbox/services/social-inbox.types';
import { SocialReplyCampaignService } from '@api/collections/social-inbox/services/social-reply-campaign.service';
import { RolesDecorator } from '@api/helpers/decorators/roles/roles.decorator';
import { RequiredScopes } from '@api/helpers/decorators/scopes/required-scopes.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { ApiKeyScope, MemberRole } from '@genfeedai/enums';
import type {
  JsonApiCollectionResponse,
  JsonApiSingleResponse,
} from '@genfeedai/interfaces';
import {
  SocialReplyCampaignRecipientSerializer,
  SocialReplyCampaignSerializer,
} from '@genfeedai/serializers';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

/**
 * Campaigns live on their own top-level path rather than under `/messages`:
 * that controller ends in a `GET :conversationId` catch-all, so a nested
 * `/messages/campaigns` route would be swallowed by it.
 */
@ApiTags('Messages')
@AutoSwagger()
@ApiBearerAuth()
@Controller('message-campaigns')
@UseGuards(RolesGuard)
export class SocialReplyCampaignController {
  constructor(private readonly campaignService: SocialReplyCampaignService) {}

  @Get()
  @ApiOperation({ summary: 'List throttled inbox reply campaigns' })
  async list(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Query() query: SocialReplyCampaignQueryDto,
  ): Promise<JsonApiCollectionResponse> {
    const scope = this.buildScope(user);
    const data = await this.campaignService.list(scope, query);
    return serializeCollection(request, SocialReplyCampaignSerializer, data);
  }

  @Post()
  @RequiredScopes(ApiKeyScope.POSTS_DRAFT, ApiKeyScope.POSTS_CREATE)
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN, MemberRole.CREATOR)
  @ApiOperation({
    summary: 'Create a reply campaign and enroll its conversations',
  })
  async create(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() body: SocialReplyCampaignCreateDto,
  ): Promise<JsonApiSingleResponse> {
    const scope = this.buildScope(user);
    const data = await this.campaignService.create(scope, body);
    return serializeSingle(request, SocialReplyCampaignSerializer, data);
  }

  @Get(':campaignId')
  @ApiOperation({ summary: 'Inspect one reply campaign' })
  async get(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('campaignId') campaignId: string,
  ): Promise<JsonApiSingleResponse> {
    const scope = this.buildScope(user);
    const data = await this.campaignService.get(scope, campaignId);
    return serializeSingle(request, SocialReplyCampaignSerializer, data);
  }

  @Get(':campaignId/recipients')
  @ApiOperation({ summary: 'List a campaign’s recipients in drain order' })
  async listRecipients(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('campaignId') campaignId: string,
    @Query() query: SocialReplyCampaignRecipientQueryDto,
  ): Promise<JsonApiCollectionResponse> {
    const scope = this.buildScope(user);
    const data = await this.campaignService.listRecipients(
      scope,
      campaignId,
      query,
    );
    return serializeCollection(
      request,
      SocialReplyCampaignRecipientSerializer,
      data,
    );
  }

  @Patch(':campaignId')
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN, MemberRole.CREATOR)
  @ApiOperation({ summary: 'Update a campaign’s copy or rate limits' })
  async patch(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('campaignId') campaignId: string,
    @Body() body: SocialReplyCampaignUpdateDto,
  ): Promise<JsonApiSingleResponse> {
    const scope = this.buildScope(user);
    const data = await this.campaignService.patch(scope, campaignId, body);
    return serializeSingle(request, SocialReplyCampaignSerializer, data);
  }

  @Patch(':campaignId/status')
  @RequiredScopes(ApiKeyScope.POSTS_PUBLISH)
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN)
  @ApiOperation({ summary: 'Start, pause, resume, or cancel a campaign' })
  async transition(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('campaignId') campaignId: string,
    @Body() body: SocialReplyCampaignStatusDto,
  ): Promise<JsonApiSingleResponse> {
    const scope = this.buildScope(user);
    const data = await this.campaignService.transition(
      scope,
      campaignId,
      body.transition,
    );
    return serializeSingle(request, SocialReplyCampaignSerializer, data);
  }

  @Delete(':campaignId')
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN)
  @ApiOperation({ summary: 'Cancel and soft-delete a reply campaign' })
  async remove(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('campaignId') campaignId: string,
  ): Promise<JsonApiSingleResponse> {
    const scope = this.buildScope(user);
    const data = await this.campaignService.remove(scope, campaignId);
    return serializeSingle(request, SocialReplyCampaignSerializer, data);
  }

  private buildScope(user: User): SocialInboxScope {
    if (!user.organizationId) {
      throw new UnauthorizedException(
        'Invalid organization context. Please sign in again.',
      );
    }

    return {
      brandId: user.brandId,
      organizationId: user.organizationId,
      userId: user.userId ?? user.id,
    };
  }
}
