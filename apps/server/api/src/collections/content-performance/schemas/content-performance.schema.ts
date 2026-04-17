export type { ContentPerformance as ContentPerformanceDocument } from '@genfeedai/prisma';

export enum PerformanceSource {
  API = 'api',
  MANUAL = 'manual',
  WEBHOOK = 'webhook',
  CSV = 'csv',
}
