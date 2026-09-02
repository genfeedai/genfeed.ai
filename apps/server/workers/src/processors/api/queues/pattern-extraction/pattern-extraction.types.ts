import type { PatternType } from '@genfeedai/contracts/interfaces';

export type PatternSourceKind = 'ad' | 'organic';

export interface PatternExample {
  orgId: string;
  platform: string;
  score: number;
  source: PatternSourceKind;
  text: string;
}

export interface ClassifiedRecord {
  classifiedType: string;
  createdAt: Date;
  id: string;
  industry?: string;
  isInsert: boolean;
  orgId: string;
  patternType: PatternType;
  platform: string;
  score: number;
  source: PatternSourceKind;
  text: string;
}

export interface PatternGroupState {
  classifiedType: string;
  examples: PatternExample[];
  industry: string;
  orgIds: string[];
  patternType: PatternType;
  platform: string;
  sampleSize: number;
  scoreSum: number;
  sources: PatternSourceKind[];
}

export interface PatternExtractionCursor {
  measuredAt: Date;
  sourceId: string;
}

export interface StoredCheckpoint {
  data: Record<string, unknown>;
  measuredAt: Date;
  sourceId: string;
}

export interface PerformanceScanRow {
  createdAt: Date;
  data: unknown;
  id: string;
  organizationId: string;
  updatedAt: Date;
}

export interface AdPerformanceScanRow extends PerformanceScanRow {
  adPlatform?: string | null;
  ctaText?: string | null;
  headlineText?: string | null;
  industry?: string | null;
  performanceScore?: number | null;
}

export interface ContentPerformanceScanRow extends PerformanceScanRow {
  performanceScore?: number | null;
  platform?: string | null;
}

export interface PatternUpsertPayload {
  avgPerformanceScore: number;
  computedAt: Date;
  description: string;
  examples: Array<{
    platform: string;
    score: number;
    source: PatternSourceKind;
    text: string;
  }>;
  formula: string;
  industry?: string;
  isDeleted: false;
  label: string;
  organization?: string;
  organizationId?: string;
  patternType: PatternType;
  platform?: string;
  sampleSize: number;
  scope: 'private' | 'public';
  source: 'ad' | 'both' | 'organic';
  validUntil: Date;
}

export interface PatternExtractionCursorWhere {
  OR?: Array<
    { updatedAt: { gt: Date } } | { id: { gt: string }; updatedAt: Date }
  >;
}
