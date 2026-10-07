import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CampaignTargetsService } from '@api/collections/campaign-targets/services/campaign-targets.service';
import { CreateOutreachCampaignDto } from '@api/collections/outreach-campaigns/dto/create-outreach-campaign.dto';
import type { OutreachCampaignsQueryDto } from '@api/collections/outreach-campaigns/dto/outreach-campaigns-query.dto';
import { UpdateOutreachCampaignDto } from '@api/collections/outreach-campaigns/dto/update-outreach-campaign.dto';
import type { OutreachCampaignDocument } from '@api/collections/outreach-campaigns/schemas/outreach-campaign.schema';
import { OutreachCampaignsService } from '@api/collections/outreach-campaigns/services/outreach-campaigns.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { FeatureFlag } from '@api/feature-flag/feature-flag.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { TenantReadPolicy } from '@api/helpers/interceptors/tenant-context/tenant-read-policy.decorator';
import { resolveTenantReadScope } from '@api/helpers/interceptors/tenant-context/tenant-read-scope.context';
import { CollectionFilterUtil } from '@api/helpers/utils/collection-filter/collection-filter.util';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { BaseCRUDController } from '@api/shared/controllers/base-crud/base-crud.controller';
import type { BaseService } from '@api/shared/services/base/base.service';
import { CampaignStatus } from '@genfeedai/contracts';
import { OutreachCampaignSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@ApiTags('OutreachCampaigns')
@AutoSwagger()
@FeatureFlag('messages')
@Controller('outreach-campaigns')
export class OutreachCampaignsController extends BaseCRUDController<
  OutreachCampaignDocument,
  CreateOutreachCampaignDto,
  UpdateOutreachCampaignDto,
  // @ts-expect-error TS2344
  OutreachCampaignsQueryDto
> {
  constructor(
    public readonly outreachCampaignsService: OutreachCampaignsService,
    public readonly loggerService: LoggerService,
    private readonly campaignTargetsService: CampaignTargetsService,
  ) {
    super(
      loggerService,
      outreachCampaignsService as unknown as BaseService<
        OutreachCampaignDocument,
        CreateOutreachCampaignDto,
        UpdateOutreachCampaignDto
      >,
      OutreachCampaignSerializer,
      'OutreachCampaign',
      ['organization', 'brand', 'user', 'credential'],
    );
  }

  @Post()
  @ApiOperation({ summary: 'Create an outreach campaign' })
  async create(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() createDto: CreateOutreachCampaignDto,
  ) {
    const data = await this.outreachCampaignsService.createScoped(createDto, {
      brandId: user.brandId,
      organizationId: user.organizationId,
      userId: user.userId ?? user.id,
    });

    return serializeSingle(request, OutreachCampaignSerializer, data);
  }

  public buildFindAllQuery(user: User, query: OutreachCampaignsQueryDto) {
    const match: Record<string, unknown> = {
      isDeleted: false,
    };

    CollectionFilterUtil.applyAuthorizedTenantMatch(match, query, user);
    match.isDeleted = false;

    if (query.platform) {
      match.platform = query.platform;
    }

    if (query.campaignType) {
      match.campaignType = query.campaignType;
    }

    if (query.status) {
      match.status = query.status;
    }

    if (query.isActive !== undefined) {
      match.isActive = query.isActive;
    }

    return {
      orderBy: handleQuerySort(query.sort),
      where: match,
    };
  }

  @TenantReadPolicy('selected')
  @Get(':id')
  @ApiOperation({ summary: 'Find a single campaign by ID' })
  async findOne(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ) {
    const readScope = resolveTenantReadScope(user);
    const campaign = await this.outreachCampaignsService.findOneById(
      id,
      readScope.organizationId,
      readScope.brandId,
    );

    if (!campaign) {
      throw new NotFoundException('Campaign', id);
    }

    return serializeSingle(request, OutreachCampaignSerializer, campaign);
  }

  public buildFindOneQuery(user: User, id: string): Record<string, unknown> {
    return {
      id,
      isDeleted: false,
      organizationId: user.organizationId,
    };
  }

  public canUserModifyEntity(
    user: User,
    entity: OutreachCampaignDocument,
  ): boolean {
    // Scalar FK: the legacy `organization` alias is undefined unless the query
    // populated the relation, which would drop this ownership check entirely.
    const entityOrganizationId = entity.organizationId;

    if (
      entityOrganizationId &&
      user.organizationId &&
      entityOrganizationId === user.organizationId
    ) {
      return true;
    }

    return Boolean(user?.isSuperAdmin);
  }

  /**
   * Lifecycle transitions prefer `PATCH /outreach-campaigns/:id` with
   * `{ status: "active" | "paused" | "completed" }` (mirrors agent-campaigns).
   */
  @Patch(':id')
  @ApiOperation({
    summary: 'Update a campaign (status transitions via status field)',
  })
  async patchCampaign(
    @Req() request: Request,
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Body() updateDto: UpdateOutreachCampaignDto,
  ) {
    const hasNonStatusUpdates = Object.entries(updateDto).some(
      ([key, value]) => key !== 'status' && value !== undefined,
    );

    if (updateDto.status && hasNonStatusUpdates) {
      throw new BadRequestException(
        'Campaign status transitions cannot be combined with other updates',
      );
    }

    if (updateDto.status === CampaignStatus.ACTIVE) {
      const data = await this.outreachCampaignsService.start(
        id,
        user.organizationId,
        user.brandId,
      );
      return serializeSingle(request, OutreachCampaignSerializer, data);
    }

    if (updateDto.status === CampaignStatus.PAUSED) {
      const data = await this.outreachCampaignsService.pause(
        id,
        user.organizationId,
        user.brandId,
      );
      return serializeSingle(request, OutreachCampaignSerializer, data);
    }

    if (updateDto.status === CampaignStatus.COMPLETED) {
      const data = await this.outreachCampaignsService.complete(
        id,
        user.organizationId,
        user.brandId,
      );
      return serializeSingle(request, OutreachCampaignSerializer, data);
    }

    const data = await this.outreachCampaignsService.patch(
      id,
      updateDto,
      user.organizationId,
      user.brandId,
    );
    return serializeSingle(request, OutreachCampaignSerializer, data);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete a campaign' })
  async remove(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ) {
    const data = await this.outreachCampaignsService.remove(
      id,
      user.organizationId,
      user.brandId,
    );

    if (!data) {
      throw new NotFoundException('Campaign', id);
    }

    return serializeSingle(request, OutreachCampaignSerializer, data);
  }

  /**
   * Get campaign analytics
   */
  @TenantReadPolicy('selected')
  @Get(':id/analytics')
  @ApiOperation({ summary: 'Get campaign analytics' })
  @ApiResponse({ description: 'Returns campaign analytics', status: 200 })
  async getAnalytics(
    @Param('id') id: string,
    @CurrentUser() user: User,
  ): Promise<{
    campaign: OutreachCampaignDocument;
    successRate: number;
    repliesPerHour: number;
    targetStats: {
      total: number;
      pending: number;
      scheduled: number;
      processing: number;
      replied: number;
      skipped: number;
      failed: number;
    };
  }> {
    const readScope = resolveTenantReadScope(user);
    const analytics = await this.outreachCampaignsService.getAnalytics(
      id,
      readScope.organizationId,
      readScope.brandId,
    );
    const targetStats = await this.campaignTargetsService.getTargetStats(
      id,
      readScope.organizationId,
    );

    return {
      ...analytics,
      targetStats,
    };
  }
}
