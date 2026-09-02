import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import {
  AuthorReplyDraftDto,
  AuthorReplyInboxQueryDto,
  AuthorReplySendDto,
  EnsureAuthorResponderDto,
  SchedulePostWatchDto,
} from '@api/collections/reply-bot-configs/dto/author-reply-loop.dto';
import { CreateReplyBotConfigDto } from '@api/collections/reply-bot-configs/dto/create-reply-bot-config.dto';
import { ReplyBotConfigsQueryDto } from '@api/collections/reply-bot-configs/dto/reply-bot-configs-query.dto';
import { UpdateReplyBotConfigDto } from '@api/collections/reply-bot-configs/dto/update-reply-bot-config.dto';
import type { ReplyBotConfigDocument } from '@api/collections/reply-bot-configs/schemas/reply-bot-config.schema';
import { ReplyBotConfigsService } from '@api/collections/reply-bot-configs/services/reply-bot-configs.service';
import { FeatureFlag } from '@api/feature-flag/feature-flag.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { CollectionFilterUtil } from '@api/helpers/utils/collection-filter/collection-filter.util';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { AuthorReplyLoopService } from '@api/services/reply-bot/author-reply-loop.service';
import { ReplyBotOrchestratorService } from '@api/services/reply-bot/reply-bot-orchestrator.service';
import { ReplyPostWatchService } from '@api/services/reply-bot/reply-post-watch.service';
import { BaseCRUDController } from '@api/shared/controllers/base-crud/base-crud.controller';
import { REPLY_BOT_FEATURE_FLAG } from '@genfeedai/contracts/constants';
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
  Query,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@ApiTags('Reply Bot Configs')
@AutoSwagger()
@FeatureFlag(REPLY_BOT_FEATURE_FLAG)
@Controller('reply-bot-configs')
export class ReplyBotConfigsController extends BaseCRUDController<
  ReplyBotConfigDocument,
  CreateReplyBotConfigDto,
  UpdateReplyBotConfigDto,
  ReplyBotConfigsQueryDto
> {
  constructor(
    public readonly replyBotConfigsService: ReplyBotConfigsService,
    public readonly loggerService: LoggerService,
    private readonly replyBotOrchestratorService: ReplyBotOrchestratorService,
    private readonly authorReplyLoopService: AuthorReplyLoopService,
    private readonly replyPostWatchService: ReplyPostWatchService,
  ) {
    super(
      loggerService,
      replyBotConfigsService,
      ReplyBotConfigSerializer,
      'ReplyBotConfig',
      ['organization', 'brand', 'user', 'monitoredAccounts'],
    );
  }

  public buildFindAllQuery(user: User, query: ReplyBotConfigsQueryDto) {
    const match: Record<string, unknown> = {
      isDeleted: query.isDeleted ?? false,
    };

    CollectionFilterUtil.applyAuthorizedTenantMatch(match, query, user);

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

    return {
      orderBy: handleQuerySort(query.sort),
      where: match,
    };
  }

  public canUserModifyEntity(user: User, entity: unknown): boolean {
    const entityRecord = entity as {
      organizationId?: string | null;
      brandId?: string | null;
    };

    const entityOrganizationId = entityRecord.organizationId;
    const entityBrandId = entityRecord.brandId;
    if (
      entityOrganizationId &&
      user.organizationId &&
      entityOrganizationId === user.organizationId &&
      (!user.brandId || entityBrandId === user.brandId)
    ) {
      return true;
    }

    return Boolean(user?.isSuperAdmin);
  }

  /**
   * Ensure a comment_responder bot for author-reply loops on brand X posts.
   */
  @Post('author-reply/ensure')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Enable/upsert X author-reply (comment_responder) for a brand',
  })
  ensureAuthorResponder(
    @CurrentUser() user: User,
    @Body() body: EnsureAuthorResponderDto,
  ) {
    return this.authorReplyLoopService.ensureAuthorResponder({
      brandId: body.brandId,
      credentialId: body.credentialId,
      isActive: body.isActive,
      organizationId: user.organizationId,
      platform: body.platform,
      userId: user.id,
    });
  }

  /**
   * Inbox: unreplied comments on this brand's own X posts (last N hours).
   */
  @Get('author-reply/inbox')
  @ApiOperation({
    summary: 'List comments on brand posts that still need an author reply',
  })
  getAuthorReplyInbox(
    @CurrentUser() user: User,
    @Query() query: AuthorReplyInboxQueryDto,
  ) {
    return this.authorReplyLoopService.getInbox({
      brandId: query.brandId,
      hours: query.hours,
      organizationId: user.organizationId,
      platform: query.platform,
    });
  }

  @Post('author-reply/draft')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Draft a harness-aware author reply (no post)' })
  draftAuthorReply(
    @CurrentUser() user: User,
    @Body() body: AuthorReplyDraftDto,
  ) {
    return this.authorReplyLoopService.draftReply({
      brandId: body.brandId,
      commentAuthor: body.commentAuthor,
      commentId: body.commentId,
      commentText: body.commentText,
      intent: body.intent,
      organizationId: user.organizationId,
      parentPostPreview: body.parentPostPreview,
      platform: body.platform,
      userId: user.id,
    });
  }

  @Post('author-reply/send')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Send author reply and record closed-loop performance',
  })
  sendAuthorReply(@CurrentUser() user: User, @Body() body: AuthorReplySendDto) {
    return this.authorReplyLoopService.sendReply({
      brandId: body.brandId,
      commentAuthor: body.commentAuthor,
      commentAuthorId: body.commentAuthorId,
      commentId: body.commentId,
      commentText: body.commentText,
      intent: body.intent,
      organizationId: user.organizationId,
      parentPostId: body.parentPostId,
      parentPostPreview: body.parentPostPreview,
      platform: body.platform,
      replyText: body.replyText,
      userId: user.id,
    });
  }

  /**
   * Schedule 24h delayed post-watch series (also called from publish hooks).
   */
  @Post('author-reply/schedule-post-watch')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Schedule delayed watches for replies under a post (24h series)',
  })
  schedulePostWatch(
    @CurrentUser() user: User,
    @Body() body: SchedulePostWatchDto,
  ) {
    return this.replyPostWatchService.schedulePostWatch({
      brandId: body.brandId,
      organizationId: user.organizationId,
      platform: body.platform,
      postId: body.postId,
      postPreview: body.postPreview,
    });
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
    return this.replyBotOrchestratorService.testReplyGeneration(
      id,
      user.organizationId,
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
    const jobId = await this.replyBotOrchestratorService.queueOrganizationBots(
      user.organizationId,
      body.credentialId,
    );

    return { jobId };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Wildcard param routes — keep last. Nest matches in declaration order, so a
  // `:id` route declared earlier swallows every static sibling path
  // (`GET /reply-bot-configs/queue-status` would resolve to findOne).
  // ────────────────────────────────────────────────────────────────────────────

  @Get(':id')
  async findOne(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ) {
    const data = await this.replyBotConfigsService.findOne({
      ...(user.brandId ? { brandId: user.brandId } : {}),
      id: id,
      organizationId: user.organizationId,
    });

    return serializeSingle(request, ReplyBotConfigSerializer, data);
  }
}
