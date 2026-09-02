import type { Asset } from '@genfeedai/prisma';

export type { Asset } from '@genfeedai/prisma';

export interface AssetDocument extends Asset {
  [key: string]: unknown;
}
