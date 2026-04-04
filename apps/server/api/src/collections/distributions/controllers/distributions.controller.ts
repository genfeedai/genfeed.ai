import {
  CreateDistributionDto,
  ScheduleDistributionDto,
} from '@api/collections/distributions/dto/create-distribution.dto';
import { QueryDistributionDto } from '@api/collections/distributions/dto/query-distribution.dto';
import { DistributionsService } from '@api/collections/distributions/services/distributions.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { TelegramDistributionService } from '@api/services/distribution/telegram/telegram-distribution.service';
import type { User } from '@clerk/backend';
import { DistributionSerializer } from '@genfeedai/serializers';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@AutoSwagger()
@ApiTags('Distributions')
@Controller('distributions')
export class DistributionsController {
  constructor(
    private readonly distributionsService: DistributionsService,
    private readonly telegramDistributionService: TelegramDistributionService,
  ) {}

  /**
   * Send content to Telegram immediately
   *
   * POST /distributions/telegram
   */
  @Post('telegram')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async sendTelegram(
    @Body() dto: CreateDistributionDto,
    @CurrentUser() user: User,
  ) {
    const { organization, user: userId } = getPublicMetadata(user);

    return await this.telegramDistributionService.sendImmediate({
      brandId: dto.brandId,
      caption: dto.caption,
      chatId: dto.chatId,
      contentType: dto.contentType,
      mediaUrl: dto.mediaUrl,
      organizationId: organization,
      text: dto.text,
      userId,
    });
  }

  /**
   * Schedule content for Telegram
   *
   * POST /distributions/telegram/schedule
   */
  @Post('telegram/schedule')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async scheduleTelegram(
    @Body() dto: ScheduleDistributionDto,
    @CurrentUser() user: User,
  ) {
    const { organization, user: userId } = getPublicMetadata(user);

    return await this.telegramDistributionService.schedule({
      brandId: dto.brandId,
      caption: dto.caption,
      chatId: dto.chatId,
      contentType: dto.contentType,
      mediaUrl: dto.mediaUrl,
      organizationId: organization,
      scheduledAt: new Date(dto.scheduledAt),
      text: dto.text,
      userId,
    });
  }

  /**
   * List distributions with optional platform filter
   *
   * GET /distributions?platform=telegram&status=published
   */
  @Get()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async list(
    @Req() req: Request,
    @Query() query: QueryDistributionDto,
    @CurrentUser() user: User,
  ) {
    const { organization } = getPublicMetadata(user);
    const page = query.page ? Number.parseInt(query.page, 10) : 1;
    const limit = query.limit ? Number.parseInt(query.limit, 10) : 20;

    const data = await this.distributionsService.findByOrganization(
      organization,
      {
        platform: query.platform,
        status: query.status,
      },
      page,
      limit,
    );

    return serializeCollection(req, DistributionSerializer, data);
  }

  /**
   * Get a single distribution
   *
   * GET /distributions/:id
   */
  @Get(':id')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findOne(
    @Req() req: Request,
    @Param('id') id: string,
    @CurrentUser() user: User,
  ) {
    const { organization } = getPublicMetadata(user);

    const data = await this.distributionsService.findOneByOrganization(
      id,
      organization,
    );

    return serializeSingle(req, DistributionSerializer, data);
  }

  /**
   * Cancel a scheduled distribution
   *
   * DELETE /distributions/:id
   */
  @Delete(':id')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async cancel(
    @Req() req: Request,
    @Param('id') id: string,
    @CurrentUser() user: User,
  ) {
    const { organization } = getPublicMetadata(user);

    const data = await this.distributionsService.cancelScheduled(
      id,
      organization,
    );

    return serializeSingle(req, DistributionSerializer, data);
  }
}
