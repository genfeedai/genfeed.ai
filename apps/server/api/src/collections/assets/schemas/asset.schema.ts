import type { Asset, AssetParent } from '@genfeedai/prisma';

export type { Asset } from '@genfeedai/prisma';

export interface AssetDocument extends Asset {
  _id: string;
  parent?: string | null;
  parentModel?: AssetParent | string;
  user?: string | null;
  [key: string]: unknown;
}
