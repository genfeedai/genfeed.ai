import type { ContentPerformance } from '@genfeedai/prisma';

export type { ContentPerformance } from '@genfeedai/prisma';

export interface ContentPerformanceDocument
  extends Omit<
    ContentPerformance,
    | 'cycleNumber'
    | 'comments'
    | 'engagementRate'
    | 'likes'
    | 'measuredAt'
    | 'saves'
    | 'shares'
  > {
  _id: string;
  brand?: string | null;
  cycleNumber?: number;
  clicks: number;
  comments?: number;
  contentType: string;
  engagementRate?: number;
  hookUsed?: string;
  likes?: number;
  measuredAt?: Date | string;
  organization: string;
  performanceScore: number;
  promptUsed?: string;
  saves?: number;
  shares?: number;
  user?: string | null;
  views: number;
  [key: string]: unknown;
}

export enum PerformanceSource {
  API = 'api',
  MANUAL = 'manual',
  WEBHOOK = 'webhook',
  CSV = 'csv',
}
