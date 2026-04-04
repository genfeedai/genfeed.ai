import { CreateReplyBotConfigDto } from '@api/collections/reply-bot-configs/dto/create-reply-bot-config.dto';
import { ReplyBotConfigsQueryDto } from '@api/collections/reply-bot-configs/dto/reply-bot-configs-query.dto';
import { UpdateReplyBotConfigDto } from '@api/collections/reply-bot-configs/dto/update-reply-bot-config.dto';
import {
  ReplyBotConfig,
  type ReplyBotConfigDocument,
} from '@api/collections/reply-bot-configs/schemas/reply-bot-config.schema';
import { ReplyBotConfigsService } from '@api/collections/reply-bot-configs/services/reply-bot-configs.service';
import { FeatureFlag } from '@api/feature-flag/feature-flag.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { ReplyBotQueueService } from '@api/queues/reply-bot/reply-bot-queue.service';
import { ReplyBotOrchestratorService } from '@api/services/reply-bot/reply-bot-orchestrator.service';
import { BaseCRUDController } from '@api/shared/controllers/base-crud/base-crud.controller';
import type { User } from '@clerk/backend';
import { ReplyBotConfigSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { type PipelineStage, Types } from 'mongoose';

@ApiTags('Reply Bot Configs')
@AutoSwagger()
@FeatureFlag('reply_bot')
@Controller('reply-bot-configs')
export class ReplyBotConfigsController extends BaseCRUDController<
  ReplyBotConfigDocument,
  CreateReplyBotConfigDto,
  UpdateReplyBotConfigDto,
  // @ts-expect-error TS2344
  ReplyBotConfigsQueryDto
> {
  constructor(
    public readonly replyBotConfigsService: ReplyBotConfigsService,
    public readonly loggerService: LoggerService,
    private readonly replyBotQueueService: ReplyBotQueueService,
    private readonly replyBotOrchestratorService: ReplyBotOrchestratorService,
  ) {
    super(
      loggerService,
      replyBotConfigsService,
      ReplyBotConfigSerializer,
      ReplyBotConfig.name,
      ['organization', 'brand', 'user', 'credential', 'monitoredAccounts'],
    );
  }

  public buildFindAllPipeline(
    user: User,
    query: ReplyBotConfigsQueryDto,
  ): PipelineStage[] {
    const publicMetadata = getPublicMetadata(user);
    const match: Record<string, unknown> = {
      isDeleted: query.isDeleted ?? false,
    };

    // Always filter by organization for multi-tenancy
    const organizationId =
      query.organization || publicMetadata.organization?.toString();
    if (organizationId) {
      match.organization = new Types.ObjectId(organizationId);
    }

    if (query.brand) {
      match.brand = new Types.ObjectId(query.brand);
    } else if (publicMetadata.brand) {
      match.brand = new Types.ObjectId(publicMetadata.brand);
    }

    // Filter by type if provided
    if (query.type) {
      match.type = query.type;
    }

    // Filter by action type if provided
    if (query.actionType) {
      match.actionType = query.actionType;
    }

    // Filter by active status if provided
    if (query.isActive !== undefined) {
      match.isActive = query.isActive;
    }

    const pipeline: PipelineStage[] = [
      { $match: match },
      { $sort: handleQuerySort(query.sort) },
    ];

    return pipeline;
  }

  public canUserModifyEntity(user: User, entity: unknown): boolean {
    const publicMetadata = getPublicMetadata(user);

    const entityOrganizationId =
      entity.organization?._id?.toString() || entity.organization?.toString();
    const entityBrandId =
      entity.brand?._id?.toString() || entity.brand?.toString();
    if (
      entityOrganizationId &&
      publicMetadata.organization &&
      entityOrganizationId === publicMetadata.organization &&
      (!publicMetadata.brand || entityBrandId === publicMetadata.brand)
    ) {
      return true;
    }

    return Boolean(publicMetadata?.isSuperAdmin);
  }

  /**
   * Toggle the active status of a reply bot config
   */
  @Post(':id/toggle')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Toggle bot active status' })
  @ApiResponse({ description: 'Bot status toggled successfully', status: 200 })
  async toggleActive(
    @Req() request: Request,
    @Param('id') id: string,
    @CurrentUser() user: User,
  ) {
    const publicMetadata = getPublicMetadata(user);
    const config = await this.replyBotConfigsService.findOneById(
      id,
      publicMetadata.organization,
      publicMetadata.brand,
    );

    if (!config) {
      throw new Error('Reply bot config not found');
    }

    // @ts-expect-error TS2554
    const data = await this.replyBotConfigsService.toggleActive(
      id,
      publicMetadata.organization,
      publicMetadata.brand,
    );
    return serializeSingle(request, ReplyBotConfigSerializer, data);
  }

  @Get(':id')
  async findOne(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ) {
    const publicMetadata = getPublicMetadata(user);
    const data = await this.replyBotConfigsService.findOne({
      ...(publicMetadata.brand
        ? { brand: new Types.ObjectId(publicMetadata.brand) }
        : {}),
      _id: new Types.ObjectId(id),
      isDeleted: false,
      organization: new Types.ObjectId(publicMetadata.organization),
    });

    return serializeSingle(request, ReplyBotConfigSerializer, data);
  }

  /**
   * Test reply generation without actually posting
   */
  @Post(':id/test')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Test reply generation (dry run)' })
  @ApiResponse({
    description: 'Returns generated reply without posting',
    status: 200,
  })
  testReplyGeneration(
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Body() body: { content: string; author: string },
  ): Promise<{ replyText: string; dmText?: string }> {
    const publicMetadata = getPublicMetadata(user);

    return this.replyBotOrchestratorService.testReplyGeneration(
      id,
      publicMetadata.organization,
      { author: body.author, content: body.content },
    );
  }

  /**
   * Manually trigger polling for this organization
   */
  @Post('trigger-polling')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Manually trigger bot polling' })
  @ApiResponse({ description: 'Polling job queued', status: 200 })
  async triggerPolling(
    @CurrentUser() user: User,
    @Body() body: { credentialId: string },
  ): Promise<{ jobId: string }> {
    const publicMetadata = getPublicMetadata(user);

    const jobId = await this.replyBotQueueService.triggerPolling(
      publicMetadata.organization,
      body.credentialId,
    );

    return { jobId };
  }

  /**
   * Get queue status for monitoring
   */
  @Get('queue-status')
  @ApiOperation({ summary: 'Get polling queue status' })
  @ApiResponse({ description: 'Returns queue statistics', status: 200 })
  getQueueStatus(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
  }> {
    return this.replyBotQueueService.getQueueStatus();
  }
}
