import {
  DistributionContentType,
  DistributionPlatform,
} from '@genfeedai/enums';
import type { Distribution } from '@genfeedai/prisma';

export type { Distribution } from '@genfeedai/prisma';

export interface DistributionDocument extends Distribution {
  caption?: string;
  chatId?: string;
  contentType?: DistributionContentType | string;
  mediaUrl?: string;
  platform?: DistributionPlatform | string;
  scheduledAt?: string | null;
  telegramMessageId?: string;
  text?: string;
  [key: string]: unknown;
}
