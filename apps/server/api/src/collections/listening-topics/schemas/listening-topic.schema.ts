import type {
  ListeningEvidenceType,
  ListeningSourcePlatform,
} from '@genfeedai/enums';
import type { SourcePostMetrics } from '@genfeedai/interfaces';

export interface ListeningTopicSourceDocument {
  id: string;
  organizationId: string;
  brandId: string;
  topicId: string;
  sourceId: string;
  platform: ListeningSourcePlatform | string;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ListeningTopicDocument {
  id: string;
  organizationId: string;
  brandId: string;
  userId: string;
  label: string;
  description?: string | null;
  keywords: string[];
  excludedKeywords: string[];
  languages: string[];
  freshnessHours: number;
  fingerprint: string;
  contractVersion: number;
  isActive: boolean;
  auditedAt: Date;
  lastCollectedAt?: Date | null;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
  sources: ListeningTopicSourceDocument[];
}

export interface ListeningEvidenceDocument {
  id: string;
  organizationId: string;
  brandId: string;
  topicId: string;
  topicSourceId: string;
  sourcePostId?: string | null;
  platform: ListeningSourcePlatform | string;
  externalId: string;
  eventType: ListeningEvidenceType | string;
  sourceUrl?: string | null;
  authorExternalId?: string | null;
  authorHandle?: string | null;
  contentExcerpt?: string | null;
  occurredAt: Date;
  collectedAt: Date;
  freshnessExpiresAt: Date;
  contractVersion: number;
  metrics: SourcePostMetrics;
  metadata: Record<string, unknown>;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}
