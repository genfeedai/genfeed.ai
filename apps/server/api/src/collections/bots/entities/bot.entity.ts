import { BaseEntity } from '@api/shared/entities/base/base.entity';
import { BotCategory, BotPlatform } from '@genfeedai/enums';
import { type Bot } from '@genfeedai/prisma';

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
  id!: string;
  mongoId!: string | null;
  userId!: string;
  organizationId!: string;
  brandId!: string | null;
  config!: Bot['config'];
  label!: string | null;
  description!: string | undefined;
  category!: BotCategory;
  status!: Bot['status'];
  platforms!: BotPlatform[];

  organization?: string;
  brand?: string;
  user?: string;

  targets!: Bot['targets'];
  settings!: Bot['settings'];

  messagesCount?: number;
  engagementsCount?: number;
  lastActiveAt?: Date;
}
