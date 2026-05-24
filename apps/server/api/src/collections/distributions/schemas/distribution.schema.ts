import {
  DistributionContentType,
  DistributionPlatform,
} from '@genfeedai/enums';
import type { Distribution } from '@genfeedai/prisma';

export type { Distribution } from '@genfeedai/prisma';

export interface DistributionDocument extends Distribution {
  _id: string;
  brand?: string | null;
  caption?: string;
  chatId?: string;
  contentType?: DistributionContentType | string;
  mediaUrl?: string;
  organization?: string;
  platform?: DistributionPlatform | string;
  scheduledAt?: string | null;
  telegramMessageId?: string;
  text?: string;
  user?: string;
  [key: string]: unknown;
}
