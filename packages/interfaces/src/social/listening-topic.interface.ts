import type {
  ListeningEvidenceType,
  ListeningSourcePlatform,
} from '@genfeedai/enums';
import type { IBaseEntity, IBrand, IOrganization, IUser } from '../index';
import type {
  ISocialSource,
  ISourcePost,
  SourcePostMetrics,
} from './source-collector.interface';

export const LISTENING_CONTRACT_VERSION = 1 as const;

export interface IListeningTopicSource extends IBaseEntity {
  organizationId: string;
  organization?: IOrganization | string;
  brandId: string;
  brand?: IBrand | string;
  topicId: string;
  sourceId: string;
  source?: ISocialSource | string;
  platform: ListeningSourcePlatform | string;
}

export interface IListeningTopic extends IBaseEntity {
  organizationId: string;
  organization?: IOrganization | string;
  brandId: string;
  brand?: IBrand | string;
  userId: string;
  user?: IUser | string;
  label: string;
  description?: string | null;
  keywords: string[];
  excludedKeywords: string[];
  languages: string[];
  freshnessHours: number;
  fingerprint: string;
  contractVersion: number;
  isActive: boolean;
  auditedAt: string;
  lastCollectedAt?: string | null;
  sources: IListeningTopicSource[];
}

export interface IListeningEvidence extends IBaseEntity {
  organizationId: string;
  organization?: IOrganization | string;
  brandId: string;
  brand?: IBrand | string;
  topicId: string;
  topic?: IListeningTopic | string;
  topicSourceId: string;
  topicSource?: IListeningTopicSource | string;
  sourcePostId?: string | null;
  sourcePost?: ISourcePost | string | null;
  platform: ListeningSourcePlatform | string;
  externalId: string;
  eventType: ListeningEvidenceType | string;
  sourceUrl?: string | null;
  authorExternalId?: string | null;
  authorHandle?: string | null;
  contentExcerpt?: string | null;
  occurredAt: string;
  collectedAt: string;
  freshnessExpiresAt: string;
  contractVersion: number;
  metrics: SourcePostMetrics;
  metadata: Record<string, unknown>;
}

export interface CreateListeningTopicInput {
  label: string;
  description?: string;
  keywords: string[];
  excludedKeywords?: string[];
  languages?: string[];
  sourceIds: string[];
  freshnessHours?: number;
  isActive?: boolean;
}

export type UpdateListeningTopicInput = Partial<CreateListeningTopicInput>;

export interface CreateListeningEvidenceInput {
  organizationId: string;
  brandId: string;
  topicId: string;
  topicSourceId: string;
  sourcePostId?: string;
  platform: ListeningSourcePlatform;
  externalId: string;
  eventType: ListeningEvidenceType;
  sourceUrl?: string;
  authorExternalId?: string;
  authorHandle?: string;
  contentExcerpt?: string;
  occurredAt: string;
  collectedAt?: string;
  freshnessExpiresAt: string;
  metrics?: SourcePostMetrics;
  metadata?: Record<string, unknown>;
}

export interface ListeningEvidenceReference {
  evidenceId: string;
  topicId: string;
  topicSourceId: string;
  sourcePostId?: string | null;
  platform: ListeningSourcePlatform | string;
  externalId: string;
  occurredAt: string;
  collectedAt: string;
}

export interface ListeningThemeReference {
  themeId: string;
  topicId: string;
  evidenceIds: string[];
  firstObservedAt: string;
  lastObservedAt: string;
}

export interface ListeningAttributionReference {
  attributionId: string;
  topicId: string;
  themeId?: string;
  evidenceIds: string[];
  actionType: 'brief' | 'publication' | 'response';
  actionId: string;
  recordedAt: string;
}
