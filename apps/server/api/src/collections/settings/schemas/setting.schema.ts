import type { Setting as PrismaSetting } from '@genfeedai/prisma';

export type { Setting as PrismaSetting } from '@genfeedai/prisma';

export interface SettingDocument extends PrismaSetting {
  _id: string;
  user?: string | null;
  [key: string]: unknown;
}
