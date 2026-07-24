import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { BotLivestreamOverrideDto } from '@api/collections/bots/dto/bot-livestream-override.dto';
import { BotLivestreamSendNowDto } from '@api/collections/bots/dto/bot-livestream-send-now.dto';
import { BotLivestreamSessionPatchDto } from '@api/collections/bots/dto/bot-livestream-session-patch.dto';
import { BotLivestreamTranscriptDto } from '@api/collections/bots/dto/bot-livestream-transcript.dto';
import { BotsQueryDto } from '@api/collections/bots/dto/bots-query.dto';
import { CreateBotDto } from '@api/collections/bots/dto/create-bot.dto';
import { UpdateBotDto } from '@api/collections/bots/dto/update-bot.dto';
import type { BotDocument } from '@api/collections/bots/schemas/bot.schema';
import { BotsService } from '@api/collections/bots/services/bots.service';
import { BotsLivestreamService } from '@api/collections/bots/services/bots-livestream.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { getPublicMetadata } from '@api/helpers/utils/auth/auth.util';
import { CollectionFilterUtil } from '@api/helpers/utils/collection-filter/collection-filter.util';
import { ErrorResponse } from '@api/helpers/utils/error-response/error-response.util';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { BaseCRUDController } from '@api/shared/controllers/base-crud/base-crud.controller';
import { BotLivestreamSessionStatus } from '@genfeedai/enums';
import {
  BotSerializer,
  LivestreamBotSessionSerializer,
} from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import type { Request } from 'express';

interface MutableEntityReference {
  id?: string;
}

interface MutableEntity {
  brand?: MutableEntityReference | string;
  organization?: MutableEntityReference | string;
  user?: MutableEntityReference | string;
}

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
    public readonly loggerService: LoggerService,
  ) {
    super(loggerService, botsService, BotSerializer, 'Bot', [
      'organization',
      'brand',
      'user',
    ]);
  }

  public buildFindAllQuery(user: User, query: BotsQueryDto) {
    const publicMetadata = getPublicMetadata(user);
    const match: Record<string, unknown> = {
      isDeleted: query.isDeleted ?? false,
    };

    const scope =
      query.scope ||
      (query.brand ? 'brand' : query.organization ? 'organization' : 'user');

    if (scope === 'organization') {
      const organizationId =
        query.organization || publicMetadata.organization?.toString();
      if (organizationId) {
        match.organization = organizationId;
      }
    }

    if (scope === 'brand') {
      const brandId = query.brand || publicMetadata.brand?.toString();
      if (brandId) {
        match.brand = brandId;
      }
    }

    if (scope === 'user') {
      const userId = query.user || publicMetadata.user?.toString();
      if (userId) {
        match.user = userId;
      }
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

  public canUserModifyEntity(user: User, entity: unknown): boolean {
    const publicMetadata = getPublicMetadata(user);
    const mutableEntity = entity as MutableEntity;

    const entityUserId =
      mutableEntity.user &&
      typeof mutableEntity.user === 'object' &&
      '_id' in mutableEntity.user
        ? mutableEntity.user.id?.toString()
        : mutableEntity.user?.toString();
    if (entityUserId && entityUserId === publicMetadata.user) {
      return true;
    }

    const entityBrandId =
      mutableEntity.brand &&
      typeof mutableEntity.brand === 'object' &&
      '_id' in mutableEntity.brand
        ? mutableEntity.brand.id?.toString()
        : mutableEntity.brand?.toString();
    if (
      entityBrandId &&
      publicMetadata.brand &&
      entityBrandId === publicMetadata.brand
    ) {
      return true;
    }

    const entityOrganizationId =
      mutableEntity.organization &&
      typeof mutableEntity.organization === 'object' &&
      '_id' in mutableEntity.organization
        ? mutableEntity.organization.id?.toString()
        : mutableEntity.organization?.toString();
    if (
      entityOrganizationId &&
      publicMetadata.organization &&
      entityOrganizationId === publicMetadata.organization
    ) {
      return true;
    }

    return Boolean(publicMetadata?.isSuperAdmin);
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
        _id: id,
        isDeleted: false,
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
