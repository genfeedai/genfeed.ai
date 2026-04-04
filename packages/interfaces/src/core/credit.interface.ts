import type { IBaseEntity } from '../index';

export interface ICredit extends IBaseEntity {
  entity: string; // Organization or User ID
  entityModel: 'Organization' | 'User';
  balance: number;
}
export interface ICreditEntry {
  balance: number;
  expiresAt?: string;
  source?: string;
  createdAt?: string;
}

export interface ICreditsBreakdown {
  total: number;
  planLimit: number;
  cycleTotal?: number;
  remainingPercent?: number;
  cycleStartAt?: string;
  cycleEndAt?: string;
  credits: ICreditEntry[];
}
