import { CreateBotDto } from '@api/collections/bots/dto/create-bot.dto';
import { UpdateBotDto } from '@api/collections/bots/dto/update-bot.dto';
import type { BotDocument } from '@api/collections/bots/schemas/bot.schema';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { pickDefinedFields } from '@api/shared/utils/object/pick-defined-fields.util';
import { BotStatus } from '@genfeedai/contracts';
import type { PopulateOption } from '@genfeedai/contracts/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable } from '@nestjs/common';

const BOT_CREATE_SCALAR_FIELDS = [
  'brandId',
  'category',
  'label',
  'organizationId',
  'platforms',
  'settings',
  'status',
  'targets',
  'userId',
] as const;

const BOT_UPDATE_SCALAR_FIELDS = [
  'category',
  'isDeleted',
  'label',
  'platforms',
  'settings',
  'status',
  'targets',
] as const;

const BOT_CONFIG_FIELDS = [
  'description',
  'engagementSettings',
  'livestreamSettings',
  'monitoringSettings',
  'publishingSettings',
] as const;

type BotOwnershipInput = {
  brandId?: string;
  organizationId?: string;
  userId?: string;
};

type BotCreateInput = CreateBotDto & BotOwnershipInput;
type BotUpdateInput = Partial<UpdateBotDto>;

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

  protected override normalizeDocument(document: unknown): BotDocument {
    const record = super.normalizeDocument(document) as Record<string, unknown>;
    const config =
      record.config !== null &&
      typeof record.config === 'object' &&
      !Array.isArray(record.config)
        ? (record.config as Record<string, unknown>)
        : {};

    return { ...config, ...record } as BotDocument;
  }

  override create(
    input: BotCreateInput,
    populate: PopulateOption[] = [],
  ): Promise<BotDocument> {
    if (!input.organizationId || !input.userId) {
      throw new BadRequestException(
        'Bot creation requires an organization and user id',
      );
    }

    return super.create(
      {
        ...pickDefinedFields(input, BOT_CREATE_SCALAR_FIELDS),
        config: pickDefinedFields(input, BOT_CONFIG_FIELDS),
      } as unknown as CreateBotDto,
      populate,
    );
  }

  override async patch(
    id: string,
    input: BotUpdateInput,
    populate: PopulateOption[] = [],
  ): Promise<BotDocument> {
    const configPatch = pickDefinedFields(input, BOT_CONFIG_FIELDS);
    const hasConfigPatch = Object.keys(configPatch).length > 0;
    let config: Record<string, unknown> | undefined;

    if (hasConfigPatch) {
      const existing = await this.findOne({ id });
      if (!existing) {
        throw new NotFoundException('Bot', id);
      }

      config = {
        ...(existing.config ?? {}),
        ...configPatch,
      };
    }

    return super.patch(
      id,
      {
        ...pickDefinedFields(input, BOT_UPDATE_SCALAR_FIELDS),
        ...(config ? { config } : {}),
      } as unknown as Partial<UpdateBotDto>,
      populate,
    );
  }

  async toggleStatus(id: string): Promise<BotDocument> {
    const bot = await this.findOne({ id });

    if (!bot) {
      throw new NotFoundException('Bot', id);
    }

    const current = String(bot.status ?? '').toUpperCase();
    const nextStatus =
      current === BotStatus.ACTIVE ? BotStatus.PAUSED : BotStatus.ACTIVE;

    return super.patch(id, { status: nextStatus } as UpdateBotDto);
  }
}
