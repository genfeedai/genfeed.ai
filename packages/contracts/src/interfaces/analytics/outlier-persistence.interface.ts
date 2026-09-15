import { Platform } from '@genfeedai/contracts';
import type { OutlierBaselinePostInput } from '@genfeedai/contracts/interfaces/analytics/outlier-baseline.interface';
import { z } from 'zod';

export const outlierConfigurationSchema = z
  .object({
    windowSize: z.number().int().min(5).max(50).default(20),
    minimumSampleSize: z.literal(5).default(5),
    outlierThreshold: z.number().finite().positive().default(3),
    breakoutThreshold: z.number().finite().positive().default(10),
    maturityHoursByPlatform: z
      .partialRecord(
        z.enum(Platform),
        z
          .number()
          .int()
          .nonnegative()
          .max(Math.floor(Number.MAX_SAFE_INTEGER / 3_600_000)),
      )
      .default({}),
  })
  .strict()
  .refine((value) => value.breakoutThreshold > value.outlierThreshold, {
    message: 'Breakout threshold must exceed outlier threshold',
    path: ['breakoutThreshold'],
  });

export type OutlierConfigurationValues = z.infer<
  typeof outlierConfigurationSchema
>;
export type OutlierAccountType = 'credential' | 'social_source';
export interface OutlierAccountScope {
  organizationId: string;
  brandId: string;
  accountType: OutlierAccountType;
  accountId: string;
}
export interface OutlierResolvedAccount extends OutlierAccountScope {
  platform: string;
}
export interface OutlierObservation extends OutlierBaselinePostInput {
  postId: string | null;
  sourcePostId: string | null;
  measuredAt: Date;
  sourceIdentity: string;
}

export interface OutlierSnapshotResponse extends OutlierResolvedAccount {
  id: string;
  contentType: string;
  medianViews: number | null;
  sampleSize: number;
  windowSize: number;
  minimumSampleSize: number;
  maturityMs: number;
  outlierThreshold: number;
  breakoutThreshold: number;
  status: 'ready' | 'insufficient_data' | 'zero_baseline';
  computedAt: string;
  exclusions: Array<{ postId: string; reason: string }>;
  unknownEligibility: Array<{
    postId: string;
    isPinnedUnknown: boolean;
    isPromotedUnknown: boolean;
  }>;
  contributorIds: string[];
}
export interface OutlierPerformanceResponse extends OutlierResolvedAccount {
  id: string;
  contentType: string;
  postId: string | null;
  sourcePostId: string | null;
  logicalPostId: string;
  measuredAt: string;
  views: number | null;
  publishedAt: string | null;
  outlierRatio: number | null;
  outlierTier: 'outlier' | 'breakout' | null;
  baselineSnapshotId: string;
  isContributor: boolean;
  eligibility: 'eligible' | 'excluded' | 'unknown';
  exclusionReasons: string[];
  isPinnedUnknown: boolean;
  isPromotedUnknown: boolean;
}
export interface OutlierConfigurationResponse
  extends OutlierConfigurationValues {
  id: string;
  organizationId: string;
}
export interface AnalyticsPersistenceContext {
  organizationId: string;
  brandId: string;
  credentialId: string;
}
export interface OutlierEligibilityFlags {
  isPinned: boolean | null;
  isPromoted: boolean | null;
}
export interface OutlierListQuery {
  platform?: string;
  contentType?: string;
  page?: number;
  limit?: number;
}
