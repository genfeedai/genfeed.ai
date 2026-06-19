import type { IBaseEntity } from '../core/base.interface';

export interface IMoodBoardLayoutItem {
  assetId: string;
  position: {
    x: number;
    y: number;
  };
  width?: number;
  z?: number;
}

export interface IMoodBoard extends IBaseEntity {
  brandId: string;
  organizationId: string;
  layout: IMoodBoardLayoutItem[];
  metadata?: Record<string, unknown>;
}
