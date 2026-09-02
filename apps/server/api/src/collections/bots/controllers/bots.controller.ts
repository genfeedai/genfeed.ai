import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { BotLivestreamOverrideDto } from '@api/collections/bots/dto/bot-livestream-override.dto';
import { BotLivestreamRestreamChatIngestDto } from '@api/collections/bots/dto/bot-livestream-restream-chat.dto';
import { BotLivestreamSendNowDto } from '@api/collections/bots/dto/bot-livestream-send-now.dto';
import { BotLivestreamSessionPatchDto } from '@api/collections/bots/dto/bot-livestream-session-patch.dto';
import { BotLivestreamTranscriptDto } from '@api/collections/bots/dto/bot-livestream-transcript.dto';
import { BotsQueryDto } from '@api/collections/bots/dto/bots-query.dto';
import { CreateBotDto } from '@api/collections/bots/dto/create-bot.dto';
import { UpdateBotDto } from '@api/collections/bots/dto/update-bot.dto';
import type { BotDocument } from '@api/collections/bots/schemas/bot.schema';
import { BotsService } from '@api/collections/bots/services/bots.service';
import { BotsLivestreamService } from '@api/collections/bots/services/bots-livestream.service';
import { BotsRestreamChatService } from '@api/collections/bots/services/bots-restream-chat.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { getIsSuperAdmin } from '@api/helpers/utils/auth/auth.util';
import { CollectionFilterUtil } from '@api/helpers/utils/collection-filter/collection-filter.util';
import { ErrorResponse } from '@api/helpers/utils/error-response/error-response.util';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { BaseCRUDController } from '@api/shared/controllers/base-crud/base-crud.controller';
import { requireRelationId } from '@api/shared/utils/relation-id/relation-id.util';
import { BotLivestreamSessionStatus } from '@genfeedai/contracts';
import {
  BotSerializer,
  LivestreamBotSessionSerializer,
} from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

@AutoSwagger()
@Controller('bots')
export class BotsController extends BaseCRUDController<
  BotDocument,
  CreateBotDto,
  UpdateBotDto,
  BotsQueryDto
> {
  constructor(
    public readonly botsService: BotsService,
    private readonly botsLivestreamService: BotsLivestreamService,
    private readonly botsRestreamChatService: BotsRestreamChatService,
    public readonly loggerService: LoggerService,
  ) {
    super(loggerService, botsService, BotSerializer, 'Bot', [
      'organization',
      'brand',
      'user',
    ]);
  }

  public buildFindAllQuery(user: User, query: BotsQueryDto) {
    const match: Record<string, unknown> = {
      isDeleted: query.isDeleted ?? false,
    };

    const scope =
      query.scope ||
      (query.brandId
        ? 'brand'
        : query.organizationId
          ? 'organization'
          : 'user');

    if (scope === 'organization') {
      const tenant = CollectionFilterUtil.resolveAuthorizedTenantQuery(
        { organizationId: query.organizationId },
        user,
      );
      match.organizationId = requireRelationId(
        tenant.organizationId || user.organizationId,
        'organization',
        'Bot listing',
      );
    }

    if (scope === 'brand') {
      const tenant = CollectionFilterUtil.resolveAuthorizedTenantQuery(
        { brandId: query.brandId, organizationId: query.organizationId },
        user,
      );
      if (tenant.organizationId) {
        match.organizationId = tenant.organizationId;
      }
      match.brandId = requireRelationId(
        tenant.brandId || user.brandId,
        'brand',
        'Bot listing',
      );
    }

    if (scope === 'user') {
      const callerUserId = user.userId ?? user.id;
      const requestedUserId = query.userId;
      if (
        requestedUserId &&
        callerUserId &&
        String(requestedUserId) !== String(callerUserId) &&
        !getIsSuperAdmin(user)
      ) {
        throw new ForbiddenException({
          detail: 'Access denied to this user',
          title: 'Forbidden',
        });
      }
      match.userId = requireRelationId(
        getIsSuperAdmin(user) && requestedUserId
          ? requestedUserId
          : callerUserId,
        'user',
        'Bot listing',
      );
    }

    // Use CollectionFilterUtil for common filtering patterns
    const platformFilter = CollectionFilterUtil.buildArrayFilter(
      query.platform,
      'platforms',
    );

    const categoryFilter = CollectionFilterUtil.buildCategoryFilter(
      query.category,
    );

    const statusFilter = CollectionFilterUtil.buildStatusFilter(query.status);

    return {
      orderBy: handleQuerySort(query.sort),
      where: {
        ...match,
        ...platformFilter,
        ...categoryFilter,
        ...statusFilter,
      },
    };
  }

  public canUserModifyEntity(user: User, entity: BotDocument): boolean {
    const callerUserId = user.userId ?? user.id;
    const callerBrandId = user.brandId;
    const callerOrganizationId = user.organizationId;

    if (entity.userId && callerUserId && entity.userId === callerUserId) {
      return true;
    }

    if (entity.brandId && callerBrandId && entity.brandId === callerBrandId) {
      return true;
    }

    if (
      entity.organizationId &&
      callerOrganizationId &&
      entity.organizationId === callerOrganizationId
    ) {
      return true;
    }

    return Boolean(user?.isSuperAdmin);
  }

  @Get(':id/livestream-session')
  async getLivestreamSession(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ) {
    const bot = await this.findBotForMutation(user, id);
    const session = await this.botsLivestreamService.getOrCreateSession(bot);
    return serializeSingle(request, LivestreamBotSessionSerializer, session);
  }

  @Patch(':id/livestream-session')
  async patchLivestreamSession(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: BotLivestreamSessionPatchDto,
  ) {
    const bot = await this.findBotForMutation(user, id);
    const session = await this.dispatchLivestreamSessionStatus(bot, dto);
    return serializeSingle(request, LivestreamBotSessionSerializer, session);
  }

  @Post(':id/livestream-session/override')
  async updateLivestreamOverride(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() payload: BotLivestreamOverrideDto,
  ) {
    const bot = await this.findBotForMutation(user, id);
    const session = await this.botsLivestreamService.setManualOverride(
      bot,
      payload,
    );
    return serializeSingle(request, LivestreamBotSessionSerializer, session);
  }

  @Post(':id/livestream-session/transcript')
  async ingestLivestreamTranscript(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() payload: BotLivestreamTranscriptDto,
  ) {
    const bot = await this.findBotForMutation(user, id);
    const session = await this.botsLivestreamService.ingestTranscriptChunk(
      bot,
      payload,
    );
    return serializeSingle(request, LivestreamBotSessionSerializer, session);
  }

  /**
   * Ingest Restream Chat WebSocket actions as rolling livestream context.
   * Preferred multi-destination audience path when streaming via Restream Studio
   * (no OBS). Host speech still uses /transcript with external STT webhooks.
   */
  @Post(':id/livestream-session/restream-chat')
  async ingestRestreamChat(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() payload: BotLivestreamRestreamChatIngestDto,
  ) {
    const bot = await this.findBotForMutation(user, id);
    return this.botsRestreamChatService.ingestChatActions(
      bot,
      payload.actions.map((action) => ({
        action: action.action,
        author: action.author,
        eventPayload: action.eventPayload,
        payload: action.payload,
        text: action.text,
      })),
    );
  }

  @Post(':id/livestream-session/send-now')
  async sendLivestreamMessageNow(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() payload: BotLivestreamSendNowDto,
  ) {
    const bot = await this.findBotForMutation(user, id);
    const session = await this.botsLivestreamService.sendNow(bot, payload);
    return serializeSingle(request, LivestreamBotSessionSerializer, session);
  }

  private async findBotForMutation(
    user: User,
    id: string,
  ): Promise<BotDocument> {
    const bot = await this.botsService.findOne(
      {
        id: id,
      },
      this.getPopulateFields(),
    );

    if (!bot || !this.canUserModifyEntity(user, bot)) {
      ErrorResponse.notFound(this.entityName, id);
    }

    return bot;
  }

  private async dispatchLivestreamSessionStatus(
    bot: BotDocument,
    dto: BotLivestreamSessionPatchDto,
  ) {
    if (dto.status === BotLivestreamSessionStatus.STOPPED) {
      return this.botsLivestreamService.stopSession(bot);
    }

    if (dto.status === BotLivestreamSessionStatus.PAUSED) {
      return this.botsLivestreamService.pauseSession(bot);
    }

    // BotLivestreamSessionStatus.ACTIVE: "start" and "resume" both persist
    // status "active" but are distinct service methods (start also resets
    // stoppedAt, resume only clears pausedAt). Disambiguate by the current
    // session status: resume from paused, start from anything else.
    const currentSession =
      await this.botsLivestreamService.getOrCreateSession(bot);

    if (currentSession.status === BotLivestreamSessionStatus.PAUSED) {
      return this.botsLivestreamService.resumeSession(bot);
    }

    return this.botsLivestreamService.startSession(bot);
  }
}
