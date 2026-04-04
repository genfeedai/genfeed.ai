import type { Distribution } from '@api/collections/distributions/schemas/distribution.schema';
import { BaseEntity } from '@api/shared/entities/base/base.entity';
import type {
  DistributionContentType,
  DistributionPlatform,
  PublishStatus,
} from '@genfeedai/enums';
import type { Types } from 'mongoose';

export class DistributionEntity extends BaseEntity implements Distribution {
  declare readonly organization: Types.ObjectId;
  declare readonly user: Types.ObjectId;
  declare readonly brand?: Types.ObjectId;
  declare readonly platform: DistributionPlatform;
  declare readonly contentType: DistributionContentType;
  declare readonly text?: string;
  declare readonly mediaUrl?: string;
  declare readonly caption?: string;
  declare readonly chatId: string;
  declare readonly status: PublishStatus;
  declare readonly scheduledAt?: Date;
  declare readonly publishedAt?: Date;
  declare readonly errorMessage?: string;
  declare readonly telegramMessageId?: string;
  declare readonly isDeleted: boolean;
}
