import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import {
  CampaignPostsDto,
  RestoreCampaignDto,
} from '@api/collections/campaigns/dto/campaign-action.dto';
import { CampaignsQueryDto } from '@api/collections/campaigns/dto/campaigns-query.dto';
import { CreateCampaignDto } from '@api/collections/campaigns/dto/create-campaign.dto';
import { GenerateCampaignContentDto } from '@api/collections/campaigns/dto/generate-campaign-content.dto';
import {
  ApproveCampaignSpendDto,
  PrepareCampaignActivationDto,
} from '@api/collections/campaigns/dto/prepare-campaign-activation.dto';
import { UpdateCampaignDto } from '@api/collections/campaigns/dto/update-campaign.dto';
import { CampaignGenerationService } from '@api/collections/campaigns/services/campaign-generation.service';
import { CampaignLifecycleService } from '@api/collections/campaigns/services/campaign-lifecycle.service';
import { CampaignPaidActivationService } from '@api/collections/campaigns/services/campaign-paid-activation.service';
import { CampaignPerformanceService } from '@api/collections/campaigns/services/campaign-performance.service';
import { CampaignsService } from '@api/collections/campaigns/services/campaigns.service';
import { RolesDecorator } from '@api/helpers/decorators/roles/roles.decorator';
import { RequiredScopes } from '@api/helpers/decorators/scopes/required-scopes.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { API_KEY_POSTING_CONFIGURATION_SCOPES } from '@api/helpers/utils/auth/api-key-publishing-scope.util';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { ApiKeyScope, MemberRole } from '@genfeedai/contracts';
import {
  CampaignLifecycleSerializer,
  CampaignPaidActivationSerializer,
  CampaignPerformanceSerializer,
  CampaignSerializer,
} from '@genfeedai/serializers';
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
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@AutoSwagger()
@ApiTags('Campaigns')
@Controller('campaigns')
export class CampaignsController {
  constructor(
    private readonly generationService: CampaignGenerationService,
    private readonly lifecycleService: CampaignLifecycleService,
    private readonly paidActivationService: CampaignPaidActivationService,
    private readonly performanceService: CampaignPerformanceService,
    private readonly service: CampaignsService,
  ) {}

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

  @Get(':id/performance')
  async getPerformance(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const data = await this.performanceService.getPerformance(
      user.organizationId,
      id,
      { endDate, startDate },
    );
    return serializeSingle(request, CampaignPerformanceSerializer, data);
  }

  @Get(':id/activations')
  async listActivations(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ) {
    const data = await this.paidActivationService.list(user.organizationId, id);
    return serializeCollection(request, CampaignPaidActivationSerializer, {
      docs: data,
    });
  }

  @Post(':id/activations')
  @UseGuards(RolesGuard)
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN)
  @RequiredScopes(ApiKeyScope.ADMIN)
  async prepareActivation(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: PrepareCampaignActivationDto,
  ) {
    const data = await this.paidActivationService.prepare(
      user.organizationId,
      user,
      id,
      dto,
    );
    return serializeSingle(request, CampaignPaidActivationSerializer, data);
  }

  @Post(':id/activations/:activationId/spend-approval')
  @UseGuards(RolesGuard)
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN)
  @RequiredScopes(ApiKeyScope.ADMIN)
  async approveSpend(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Param('activationId') activationId: string,
    @Body() dto: ApproveCampaignSpendDto,
  ) {
    const data = await this.paidActivationService.approveSpend(
      user.organizationId,
      this.resolveUserId(user),
      id,
      activationId,
      dto,
    );
    return serializeSingle(request, CampaignPaidActivationSerializer, data);
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

  @Post(':id/start')
  @RequiredScopes(...API_KEY_POSTING_CONFIGURATION_SCOPES)
  async start(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ) {
    const data = await this.lifecycleService.start(
      user.organizationId,
      this.resolveUserId(user),
      id,
    );
    return serializeSingle(request, CampaignLifecycleSerializer, data);
  }

  @Post(':id/pause')
  @RequiredScopes(...API_KEY_POSTING_CONFIGURATION_SCOPES)
  async pause(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ) {
    const data = await this.lifecycleService.pause(
      user.organizationId,
      this.resolveUserId(user),
      id,
    );
    return serializeSingle(request, CampaignLifecycleSerializer, data);
  }

  @Post(':id/complete')
  @RequiredScopes(...API_KEY_POSTING_CONFIGURATION_SCOPES)
  async complete(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ) {
    const data = await this.lifecycleService.complete(
      user.organizationId,
      this.resolveUserId(user),
      id,
    );
    return serializeSingle(request, CampaignLifecycleSerializer, data);
  }

  @Post(':id/generate')
  @RequiredScopes(...API_KEY_POSTING_CONFIGURATION_SCOPES)
  async generate(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: GenerateCampaignContentDto,
  ) {
    const data = await this.generationService.generate(
      user.organizationId,
      this.resolveUserId(user),
      id,
      dto,
    );
    return serializeSingle(request, CampaignLifecycleSerializer, data);
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
    return serializeSingle(request, CampaignLifecycleSerializer, data);
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
    return serializeSingle(request, CampaignLifecycleSerializer, data);
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
