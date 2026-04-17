import { CreateBotDto } from '@api/collections/bots/dto/create-bot.dto';
import { UpdateBotDto } from '@api/collections/bots/dto/update-bot.dto';
import type { BotDocument } from '@api/collections/bots/schemas/bot.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { BotStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, NotFoundException } from '@nestjs/common';

@Injectable()
export class BotsService extends BaseService<
  BotDocument,
  CreateBotDto,
  UpdateBotDto
> {
  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
  ) {
    super(prisma, 'bot', logger);
  }

  async toggleStatus(id: string): Promise<BotDocument> {
    const bot = await this.findOne({ id });

    if (!bot) {
      throw new NotFoundException(`Bot ${id} not found`);
    }

    const nextStatus =
      bot.status === BotStatus.ACTIVE ? BotStatus.PAUSED : BotStatus.ACTIVE;

    return super.patch(id, { status: nextStatus } as UpdateBotDto);
  }
}
