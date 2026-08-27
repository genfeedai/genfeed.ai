import type { CreativePattern } from '@genfeedai/prisma';

export type { CreativePattern } from '@genfeedai/prisma';

export interface CreativePatternExample {
  adId?: string;
  bodyText?: string;
  headlineText?: string;
  imageUrl?: string;
  sourceId?: string;
  text?: string;
  videoUrl?: string;
  [key: string]: unknown;
}

export interface CreativePatternDocument extends Omit<CreativePattern, 'data'> {
  avgPerformanceScore?: number;
  data?: Record<string, unknown>;
  description?: string;
  examples?: CreativePatternExample[];
  formula?: string;
  industry?: string | null;
  label?: string;
  patternType?: string;
  platform?: string | null;
  scope?: string;
  validUntil?: Date | string;
  [key: string]: unknown;
}
