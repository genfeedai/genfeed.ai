import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { AddCampaignTargetsDto } from '@api/collections/outreach-campaigns/dto/add-campaign-targets.dto';
import { OutreachCampaignTargetOperationsService } from '@api/collections/outreach-campaigns/services/outreach-campaign-target-operations.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import type {
  CampaignPlatform,
  CampaignTargetType,
} from '@genfeedai/contracts';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

@ApiTags('OutreachCampaigns')
@AutoSwagger()
@Controller('outreach-campaigns')
export class OutreachCampaignTargetsController {
  constructor(
    private readonly targetOperationsService: OutreachCampaignTargetOperationsService,
  ) {}

  @Post(':id/targets')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'OutreachCampaignsController.addTargets',
    summary: 'Add targets to a campaign',
  })
  @ApiResponse({ description: 'Targets added successfully', status: 200 })
  addTargets(
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Body() body: AddCampaignTargetsDto,
  ): Promise<{ added: number; skipped: number }> {
    return this.targetOperationsService.addTargets(id, user, body);
  }

  @Post('parse-url')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'OutreachCampaignsController.parseUrlEndpoint',
    summary: 'Parse a URL and return metadata',
  })
  @ApiResponse({ description: 'URL parsed successfully', status: 200 })
  parseUrlEndpoint(@Body() body: { url: string }): {
    externalId?: string;
    platform?: CampaignPlatform;
    targetType?: CampaignTargetType;
    valid: boolean;
  } {
    return this.targetOperationsService.parseUrl(body.url);
  }

  @Get(':id/targets')
  @ApiOperation({
    operationId: 'OutreachCampaignsController.getTargets',
    summary: 'Get targets for a campaign',
  })
  @ApiResponse({ description: 'Returns campaign targets', status: 200 })
  getTargets(
    @Param('id') id: string,
    @CurrentUser() user: User,
  ): Promise<unknown[]> {
    return this.targetOperationsService.getTargets(id, user);
  }

  @Post(':id/targets/discover')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'OutreachCampaignsController.discoverTargets',
    summary: 'Discover targets using AI-powered search',
  })
  @ApiResponse({ description: 'Targets discovered and added', status: 200 })
  discoverTargets(
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Body() body: { addToCampaign?: boolean; limit?: number },
  ): Promise<{ added: number; discovered: number; targets: unknown[] }> {
    return this.targetOperationsService.discoverTargets(id, user, body);
  }

  @Post(':id/targets/:targetId/preview')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'OutreachCampaignsController.previewReply',
    summary: 'Preview AI-generated reply for a target',
  })
  @ApiResponse({ description: 'Reply preview generated', status: 200 })
  previewReply(
    @Param('id') id: string,
    @Param('targetId') targetId: string,
    @CurrentUser() user: User,
  ): Promise<{ replyText: string; target: unknown }> {
    return this.targetOperationsService.previewReply(id, targetId, user);
  }
}
