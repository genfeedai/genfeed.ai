import type { BrandMemory as PrismaBrandMemory } from '@genfeedai/prisma';

export interface BrandMemoryEntry {
  content: string;
  metadata?: Record<string, unknown>;
  timestamp?: Date | string;
  type: string;
  [key: string]: unknown;
}

export interface BrandMemoryInsight {
  category: string;
  confidence: number;
  createdAt?: Date | string;
  insight: string;
  source: string;
  [key: string]: unknown;
}

export interface BrandMemoryMetrics {
  avgEngagementRate?: number;
  postsPublished?: number;
  topPerformingFormat?: string;
  topPerformingTime?: string;
  totalEngagement?: number;
  [key: string]: unknown;
}

export interface BrandMemoryDocument extends PrismaBrandMemory {
  _id: string;
  brand?: string | null;
  entries?: BrandMemoryEntry[];
  insights?: BrandMemoryInsight[];
  metrics?: BrandMemoryMetrics;
  organization?: string | null;
  [key: string]: unknown;
}

export type BrandMemory = BrandMemoryDocument;
