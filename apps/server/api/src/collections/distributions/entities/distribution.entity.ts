import type { Distribution } from '@api/collections/distributions/schemas/distribution.schema';
import { BaseEntity } from '@api/shared/entities/base/base.entity';
import type {
  DistributionContentType,
  DistributionPlatform,
  PublishStatus,
} from '@genfeedai/enums';

export class DistributionEntity extends BaseEntity implements Distribution {
  declare readonly organizationId: string;
  declare readonly userId: string;
  declare readonly brandId: string | null;
  declare readonly config: Distribution['config'];
  declare readonly isActive: boolean;
  declare readonly organization: string;
  declare readonly user: string;
  declare readonly brand?: string;
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
