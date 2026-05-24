import { BotLivestreamOverrideDto } from '@api/collections/bots/dto/bot-livestream-override.dto';
import { BotLivestreamSendNowDto } from '@api/collections/bots/dto/bot-livestream-send-now.dto';
import { BotLivestreamTranscriptDto } from '@api/collections/bots/dto/bot-livestream-transcript.dto';
import { BotsQueryDto } from '@api/collections/bots/dto/bots-query.dto';
import { CreateBotDto } from '@api/collections/bots/dto/create-bot.dto';
import { UpdateBotDto } from '@api/collections/bots/dto/update-bot.dto';
import {
  Bot,
  type BotDocument,
} from '@api/collections/bots/schemas/bot.schema';
import { BotsService } from '@api/collections/bots/services/bots.service';
import { BotsLivestreamService } from '@api/collections/bots/services/bots-livestream.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import { CollectionFilterUtil } from '@api/helpers/utils/collection-filter/collection-filter.util';
import { ErrorResponse } from '@api/helpers/utils/error-response/error-response.util';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { BaseCRUDController } from '@api/shared/controllers/base-crud/base-crud.controller';
import type { User } from '@clerk/backend';
import {
  BotSerializer,
  LivestreamBotSessionSerializer,
} from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';

interface MutableEntityReference {
  _id?: string | string;
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
        ? mutableEntity.user._id?.toString()
        : mutableEntity.user?.toString();
    if (entityUserId && entityUserId === publicMetadata.user) {
      return true;
    }

    const entityBrandId =
      mutableEntity.brand &&
      typeof mutableEntity.brand === 'object' &&
      '_id' in mutableEntity.brand
        ? mutableEntity.brand._id?.toString()
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
        ? mutableEntity.organization._id?.toString()
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

  @Post(':id/livestream-session/start')
  async startLivestreamSession(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ) {
    const bot = await this.findBotForMutation(user, id);
    const session = await this.botsLivestreamService.startSession(bot);
    return serializeSingle(request, LivestreamBotSessionSerializer, session);
  }

  @Post(':id/livestream-session/stop')
  async stopLivestreamSession(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ) {
    const bot = await this.findBotForMutation(user, id);
    const session = await this.botsLivestreamService.stopSession(bot);
    return serializeSingle(request, LivestreamBotSessionSerializer, session);
  }

  @Post(':id/livestream-session/pause')
  async pauseLivestreamSession(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ) {
    const bot = await this.findBotForMutation(user, id);
    const session = await this.botsLivestreamService.pauseSession(bot);
    return serializeSingle(request, LivestreamBotSessionSerializer, session);
  }

  @Post(':id/livestream-session/resume')
  async resumeLivestreamSession(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ) {
    const bot = await this.findBotForMutation(user, id);
    const session = await this.botsLivestreamService.resumeSession(bot);
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

  @Get(':id/livestream-session/history')
  async getLivestreamDeliveryHistory(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ) {
    const bot = await this.findBotForMutation(user, id);
    const session = await this.botsLivestreamService.getOrCreateSession(bot);
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
}
