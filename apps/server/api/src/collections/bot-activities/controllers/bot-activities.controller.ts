import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { OpenAssistedReplyDto } from '@api/collections/bot-activities/dto/assisted-reply.dto';
import { BotActivitiesQueryDto } from '@api/collections/bot-activities/dto/bot-activities-query.dto';
import { AssistedReplyQueueService } from '@api/collections/bot-activities/services/assisted-reply-queue.service';
import {
  BotActivitiesService,
  type BotActivityStats,
} from '@api/collections/bot-activities/services/bot-activities.service';
import { OrganizationModule } from '@api/common/organization-modules/organization-module.decorator';
import { FeatureFlag } from '@api/feature-flag/feature-flag.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { TenantReadPolicy } from '@api/helpers/interceptors/tenant-context/tenant-read-policy.decorator';
import { resolveTenantReadScope } from '@api/helpers/interceptors/tenant-context/tenant-read-scope.context';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { REPLY_BOT_FEATURE_FLAG } from '@genfeedai/contracts/constants';
import type {
  IAssistedReplyOpenResult,
  IAssistedReplyUsage,
} from '@genfeedai/contracts/interfaces';
import { BotActivitySerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@ApiTags('Bot Activities')
@AutoSwagger()
@FeatureFlag(REPLY_BOT_FEATURE_FLAG)
@OrganizationModule('messages')
@Controller('bot-activities')
export class BotActivitiesController {
  constructor(
    private readonly botActivitiesService: BotActivitiesService,
    private readonly assistedReplyQueueService: AssistedReplyQueueService,
    readonly _loggerService: LoggerService,
  ) {}

  /**
   * Get paginated list of bot activities with filters
   */
  @TenantReadPolicy('selected')
  @Get()
  @ApiOperation({ summary: 'Get bot activities with pagination and filters' })
  @ApiResponse({
    description: 'Returns paginated bot activities',
    status: 200,
  })
  async findAll(
    @Req() req: Request,
    @Query() query: BotActivitiesQueryDto,
    @CurrentUser() user: User,
  ) {
    const readScope = resolveTenantReadScope(user);
    const result = await this.botActivitiesService.findWithFilters(
      readScope.organizationId,
      readScope.brandId,
      query,
    );

    return serializeCollection(req, BotActivitySerializer, result);
  }

  /**
   * Warm-up reply queue usage: drafts waiting, replies posted in the last 24
   * hours, and the daily cap.
   */
  @TenantReadPolicy('selected')
  @Get('reply-queue/usage')
  @ApiOperation({ summary: 'Get the X warm-up reply queue usage and cap' })
  @ApiResponse({ description: 'Returns queue usage', status: 200 })
  getReplyQueueUsage(@CurrentUser() user: User): Promise<IAssistedReplyUsage> {
    const readScope = resolveTenantReadScope(user);
    return this.assistedReplyQueueService.getUsage({
      brandId: readScope.brandId,
      organizationId: readScope.organizationId,
    });
  }

  /**
   * Get a single bot activity by ID
   */
  @TenantReadPolicy('selected')
  @Get(':id')
  @ApiOperation({ summary: 'Get a single bot activity' })
  @ApiResponse({
    description: 'Returns the bot activity',
    status: 200,
  })
  async findOne(
    @Req() req: Request,
    @Param('id') id: string,
    @CurrentUser() user: User,
  ) {
    const readScope = resolveTenantReadScope(user);
    const activity = await this.botActivitiesService.findOne({
      ...(readScope.brandId ? { brandId: readScope.brandId } : {}),
      id: id,
      organizationId: readScope.organizationId,
    });
    return serializeSingle(req, BotActivitySerializer, activity);
  }

  /**
   * Get aggregated statistics for bot activities
   */
  @TenantReadPolicy('selected')
  @Get('stats/summary')
  @ApiOperation({ summary: 'Get aggregated bot activity statistics' })
  @ApiResponse({
    description: 'Returns activity statistics',
    status: 200,
  })
  getStats(
    @Query('replyBotConfigId') replyBotConfigId: string,
    @Query('fromDate') fromDate: string,
    @Query('toDate') toDate: string,
    @CurrentUser() user: User,
  ): Promise<BotActivityStats> {
    const readScope = resolveTenantReadScope(user);
    return this.botActivitiesService.getStats(
      readScope.organizationId,
      readScope.brandId,
      replyBotConfigId,
      fromDate ? new Date(fromDate) : undefined,
      toDate ? new Date(toDate) : undefined,
    );
  }

  /**
   * Save the edited draft and return the X composer link for it. Genfeed
   * never posts these replies; the person posts them in X.
   */
  @Post(':id/reply-queue/open')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Open a drafted X reply in the X composer' })
  @ApiResponse({
    description: 'Returns the prefilled X reply link',
    status: 200,
  })
  openReplyQueueItem(
    @Param('id') id: string,
    @Body() body: OpenAssistedReplyDto,
    @CurrentUser() user: User,
  ): Promise<IAssistedReplyOpenResult> {
    return this.assistedReplyQueueService.open(
      { brandId: user.brandId, organizationId: user.organizationId },
      id,
      body.replyText,
    );
  }

  @Post(':id/reply-queue/posted')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm a drafted X reply was posted in X' })
  @ApiResponse({ description: 'Returns the updated queue usage', status: 200 })
  confirmReplyQueueItemPosted(
    @Param('id') id: string,
    @CurrentUser() user: User,
  ): Promise<IAssistedReplyUsage> {
    return this.assistedReplyQueueService.markPosted(
      { brandId: user.brandId, organizationId: user.organizationId },
      id,
    );
  }

  @Post(':id/reply-queue/dismiss')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Dismiss a drafted X reply' })
  @ApiResponse({ description: 'Returns the updated queue usage', status: 200 })
  dismissReplyQueueItem(
    @Param('id') id: string,
    @CurrentUser() user: User,
  ): Promise<IAssistedReplyUsage> {
    return this.assistedReplyQueueService.dismiss(
      { brandId: user.brandId, organizationId: user.organizationId },
      id,
    );
  }
}
