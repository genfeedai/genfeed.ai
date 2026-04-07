import { CreateBotDto } from '@api/collections/bots/dto/create-bot.dto';
import { UpdateBotDto } from '@api/collections/bots/dto/update-bot.dto';
import {
  Bot,
  type BotDocument,
} from '@api/collections/bots/schemas/bot.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { BaseService } from '@api/shared/services/base/base.service';
import { AggregatePaginateModel } from '@api/types/mongoose-aggregate-paginate-v2';
import { BotStatus } from '@genfeedai/enums';
import type { PopulateOption } from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';

@Injectable()
export class BotsService extends BaseService<
  BotDocument,
  CreateBotDto,
  UpdateBotDto
> {
  constructor(
    @InjectModel(Bot.name, DB_CONNECTIONS.CLOUD)
    model: AggregatePaginateModel<BotDocument>,
    logger: LoggerService,
  ) {
    super(model, logger);
  }

  create(
    createDto: CreateBotDto,
    populate: (string | PopulateOption)[] = [
      { path: 'organization' },
      { path: 'brand' },
    ],
  ): Promise<BotDocument> {
    return super.create(createDto, populate);
  }

  patch(
    id: string,
    updateDto: UpdateBotDto,
    populate: (string | PopulateOption)[] = [
      { path: 'organization' },
      { path: 'brand' },
    ],
  ): Promise<BotDocument> {
    return super.patch(id, updateDto, populate);
  }

  async toggleStatus(id: string): Promise<BotDocument> {
    const bot = await this.findOne({ _id: id });

    if (!bot) {
      throw new NotFoundException(`Bot ${id} not found`);
    }

    const nextStatus =
      bot.status === BotStatus.ACTIVE ? BotStatus.PAUSED : BotStatus.ACTIVE;

    return super.patch(id, { status: nextStatus } as UpdateBotDto, [
      { path: 'organization' },
      { path: 'brand' },
    ]);
  }
}
