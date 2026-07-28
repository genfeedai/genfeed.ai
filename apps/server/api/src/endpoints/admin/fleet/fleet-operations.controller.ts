import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { SuperAdminGuard } from '@api/common/guards/super-admin.guard';
import {
  BulkEc2ActionDto,
  CloudFrontInvalidateDto,
  Ec2ActionDto,
} from '@api/endpoints/admin/fleet/dto';
import { AdminFleetService } from '@api/endpoints/admin/fleet/fleet.service';
import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { getPublicMetadata } from '@api/helpers/utils/auth/auth.util';
import { ErrorResponse } from '@api/helpers/utils/error-response/error-response.util';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { FleetService } from '@api/services/integrations/fleet/fleet.service';
import {
  FleetCloudFrontInvalidationSerializer,
  FleetEc2ActionResultSerializer,
  FleetEc2BulkActionResultSerializer,
  FleetEc2InstanceSerializer,
  FleetHealthSerializer,
  FleetPipelineCampaignSerializer,
  FleetPipelineStatsSerializer,
  FleetServiceStatusSerializer,
} from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@ApiTags('Admin / Fleet')
@Controller(['admin/fleet', 'admin/darkroom'])
@UseGuards(IpWhitelistGuard, SuperAdminGuard)
class AdminFleetController {
  constructor(
    private readonly adminFleetService: AdminFleetService,
    private readonly fleetService: FleetService,
    private readonly loggerService: LoggerService,
  ) {}

  @Get('pipeline/campaigns')
  @ApiOperation({
    summary: 'List campaigns with stats',
  })
  async listCampaigns(@Req() request: Request, @CurrentUser() user: User) {
    try {
      const { organization } = getPublicMetadata(user);
      const campaigns =
        await this.adminFleetService.listCampaigns(organization);
      const data = campaigns.map((campaign: (typeof campaigns)[number]) => ({
        _id: campaign.campaign,
        assetsCount: campaign.assetCount,
        createdAt: campaign.createdAt,
        id: campaign.campaign,
        name: campaign.campaign,
        status: campaign.status,
      }));
      return serializeCollection(request, FleetPipelineCampaignSerializer, {
        docs: data,
        hasNextPage: false,
        hasPrevPage: false,
        limit: data.length,
        nextPage: null,
        page: 1,
        pagingCounter: 1,
        prevPage: null,
        totalDocs: data.length,
        totalPages: 1,
      });
    } catch (error) {
      return ErrorResponse.handle(error, this.loggerService, 'listCampaigns');
    }
  }

  @Get('pipeline/stats')
  @ApiOperation({
    summary: 'Get pipeline statistics',
  })
  async getPipelineStats(@Req() request: Request, @CurrentUser() user: User) {
    try {
      const { organization } = getPublicMetadata(user);
      const stats = await this.adminFleetService.getPipelineStats(organization);
      const data = {
        _id: `pipeline-stats:${organization}`,
        assetsGenerated: stats.assets.total,
        assetsPendingReview: stats.assets.byReviewStatus.pending ?? 0,
        assetsPublished: stats.assets.byReviewStatus.approved ?? 0,
        trainingsActive: Object.entries(stats.trainings.byStage)
          .filter(([stage]) => !['completed', 'failed'].includes(stage))
          .reduce((sum, [, count]) => sum + Number(count), 0),
      };
      return serializeSingle(request, FleetPipelineStatsSerializer, data);
    } catch (error) {
      return ErrorResponse.handle(
        error,
        this.loggerService,
        'getPipelineStats',
      );
    }
  }

  @Get('infrastructure/ec2/status')
  @ApiOperation({
    summary: 'List EC2 instances with status',
  })
  async getEC2Status(@Req() request: Request) {
    try {
      const data = await this.adminFleetService.getEC2Status();
      return serializeCollection(request, FleetEc2InstanceSerializer, {
        docs: data.map((instance: (typeof data)[number]) => ({
          _id: instance.instanceId,
          ...instance,
        })),
        hasNextPage: false,
        hasPrevPage: false,
        limit: data.length,
        nextPage: null,
        page: 1,
        pagingCounter: 1,
        prevPage: null,
        totalDocs: data.length,
        totalPages: 1,
      });
    } catch (error) {
      return ErrorResponse.handle(error, this.loggerService, 'getEC2Status');
    }
  }

  @Post('infrastructure/ec2/action')
  @ApiOperation({
    summary: 'Start or stop an EC2 instance',
  })
  async ec2Action(@Req() request: Request, @Body() dto: Ec2ActionDto) {
    try {
      const data = await this.adminFleetService.ec2Action(
        dto.instanceId,
        dto.action,
      );
      return serializeSingle(request, FleetEc2ActionResultSerializer, {
        _id: `${dto.action}:${dto.instanceId}`,
        ...data,
      });
    } catch (error) {
      return ErrorResponse.handle(error, this.loggerService, 'ec2Action');
    }
  }

  @Post('infrastructure/ec2/action-all')
  @ApiOperation({
    summary: 'Start or stop all matching EC2 instances',
  })
  async ec2ActionAll(@Req() request: Request, @Body() dto: BulkEc2ActionDto) {
    try {
      const data = await this.adminFleetService.ec2ActionAll(
        dto.action,
        dto.role,
      );
      return serializeSingle(request, FleetEc2BulkActionResultSerializer, {
        _id: `ec2-action-all:${dto.action}:${dto.role ?? 'all'}`,
        ...data,
      });
    } catch (error) {
      return ErrorResponse.handle(error, this.loggerService, 'ec2ActionAll');
    }
  }

  @Post('infrastructure/cloudfront/invalidate')
  @ApiOperation({
    summary: 'Invalidate CloudFront cache',
  })
  async invalidateCloudFront(
    @Req() request: Request,
    @Body() dto: CloudFrontInvalidateDto,
  ) {
    try {
      const data = await this.adminFleetService.invalidateCloudFront(
        dto.distributionId ||
          this.adminFleetService.getDefaultCloudFrontDistributionId(),
        dto.paths,
      );
      return serializeSingle(request, FleetCloudFrontInvalidationSerializer, {
        _id: data.invalidationId,
        ...data,
      });
    } catch (error) {
      return ErrorResponse.handle(
        error,
        this.loggerService,
        'invalidateCloudFront',
      );
    }
  }

  @Get('infrastructure/services')
  @ApiOperation({
    summary: 'Check ComfyUI and Ollama health',
  })
  async getServiceHealth(@Req() request: Request) {
    try {
      const data = await this.adminFleetService.getServiceHealth();
      return serializeCollection(request, FleetServiceStatusSerializer, {
        docs: data.map((service: (typeof data)[number]) => ({
          _id: service.name,
          ...service,
        })),
        hasNextPage: false,
        hasPrevPage: false,
        limit: data.length,
        nextPage: null,
        page: 1,
        pagingCounter: 1,
        prevPage: null,
        totalDocs: data.length,
        totalPages: 1,
      });
    } catch (error) {
      return ErrorResponse.handle(
        error,
        this.loggerService,
        'getServiceHealth',
      );
    }
  }

  @Get('infrastructure/fleet/health')
  @ApiOperation({
    summary: 'Get detailed GPU fleet health',
  })
  async getFleetHealth(@Req() request: Request) {
    try {
      const data = await this.fleetService.getFleetHealth();
      return serializeSingle(request, FleetHealthSerializer, {
        _id: `fleet-health:${data.timestamp}`,
        ...data,
      });
    } catch (error) {
      return ErrorResponse.handle(error, this.loggerService, 'getFleetHealth');
    }
  }
}

export { AdminFleetController as AdminFleetOperationsController };
