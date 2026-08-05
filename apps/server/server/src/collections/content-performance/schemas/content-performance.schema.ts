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
  cycleNumber?: number;
  clicks?: number;
  comments?: number;
  contentType: string;
  engagementRate?: number;
  hookUsed?: string;
  likes?: number;
  measuredAt?: Date | string;
  performanceScore: number;
  promptUsed?: string;
  saves?: number;
  shares?: number;
  views: number;
}

export enum PerformanceSource {
  API = 'api',
  MANUAL = 'manual',
  WEBHOOK = 'webhook',
  CSV = 'csv',
}
