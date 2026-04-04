import { Bot } from '@api/collections/bots/schemas/bot.schema';
import { BaseEntity } from '@api/shared/entities/base/base.entity';
import { BotCategory, BotPlatform, BotStatus } from '@genfeedai/enums';
import { Types } from 'mongoose';

export class BotTargetEntity {
  platform!: BotPlatform;
  channelId!: string;
  channelLabel?: string;
  channelUrl?: string;
  isEnabled?: boolean;
}

export class BotResponseTemplateEntity {
  trigger!: string;
  response!: string;
}

export class BotSettingsEntity {
  messagesPerMinute?: number;
  responseDelaySeconds?: number;
  triggers?: string[];
  responses?: BotResponseTemplateEntity[];
}

export class BotEntity extends BaseEntity implements Bot {
  label!: string;
  description?: string;
  category!: BotCategory;
  status!: BotStatus;
  platforms!: BotPlatform[];

  organization?: Types.ObjectId;
  brand?: Types.ObjectId;
  user?: Types.ObjectId;

  targets?: BotTargetEntity[];
  settings?: BotSettingsEntity;

  messagesCount?: number;
  engagementsCount?: number;
  lastActiveAt?: Date;
}
