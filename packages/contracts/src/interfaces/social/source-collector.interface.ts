import type {
  SocialSourceHistoryImportStatus,
  SocialSourcePlatform,
  SocialSourceType,
  SourcePostActionType,
} from '../..';
import type { IBaseEntity } from '../index';

/**
 * Audit trail for importing a connected account's existing posts. Stored on
 * `ISocialSource.metadata.historyImport` for own-account sources.
 */
export interface SocialSourceHistoryImport {
  status: SocialSourceHistoryImportStatus;
  credentialId: string;
  /** How far back the import reaches, in days. */
  windowDays: number;
  requestedAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
  importedCount?: number;
  rejectedCount?: number;
  /** Which collector fulfilled the import (brand-oauth, apify, ...). */
  provider?: string | null;
  error?: string | null;
  /** Why the import was skipped (e.g. the brand opted out). */
  skipReason?: string | null;
}

export interface SocialSourceMetadata {
  historyImport?: SocialSourceHistoryImport;
  [key: string]: unknown;
}

/** Queue payload for the own-account history import system workflow. */
export interface SocialSourceHistoryImportWorkflowInput {
  organizationId: string;
  brandId: string;
  sourceId: string;
  credentialId: string;
  userId: string;
  windowDays: number;
  limit: number;
}

export interface SocialSourceHistoryImportScheduleResult {
  status: 'scheduled' | 'skipped';
  sourceId?: string;
  skipReason?:
    | 'brand_opted_out'
    | 'credential_unavailable'
    | 'missing_handle'
    | 'unsupported_platform';
}

export interface SourcePostMetrics {
  likes?: number;
  comments?: number;
  shares?: number;
  views?: number;
  reposts?: number;
  quotes?: number;
  [key: string]: number | string | boolean | null | undefined;
}

export interface ISocialSource extends IBaseEntity {
  organizationId: string;
  brandId: string;
  userId: string;
  credentialId?: string | null;
  platform: SocialSourcePlatform | string;
  sourceType: SocialSourceType | string;
  externalId?: string | null;
  handle: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  profileUrl?: string | null;
  bio?: string | null;
  followersCount?: number | null;
  isActive: boolean;
  lastSyncedAt?: string | null;
  lastSyncStatus?: string | null;
  lastSyncError?: string | null;
  lastPostExternalId?: string | null;
  metadata?: SocialSourceMetadata;
}

export interface ISourcePost extends IBaseEntity {
  organizationId: string;
  brandId: string;
  userId?: string | null;
  sourceId: string;
  platform: SocialSourcePlatform | string;
  externalId: string;
  contentType: string;
  text?: string | null;
  authorId?: string | null;
  authorHandle?: string | null;
  authorDisplayName?: string | null;
  authorAvatarUrl?: string | null;
  authorFollowersCount?: number | null;
  sourceUrl?: string | null;
  mediaUrls?: string[];
  thumbnailUrl?: string | null;
  metrics?: SourcePostMetrics;
  hashtags?: string[];
  publishedAt?: string | null;
  collectedAt?: string | null;
  raw?: Record<string, unknown>;
}

export interface CreateSocialSourceInput {
  platform: SocialSourcePlatform | string;
  handle: string;
  credentialId?: string;
  displayName?: string;
  avatarUrl?: string;
  profileUrl?: string;
  bio?: string;
  externalId?: string;
  followersCount?: number;
  isActive?: boolean;
}

export interface UpdateSocialSourceInput
  extends Partial<CreateSocialSourceInput> {
  lastPostExternalId?: string | null;
  lastSyncError?: string | null;
  lastSyncStatus?: string | null;
}

export interface SocialSourcesResponse {
  sources: ISocialSource[];
  posts: ISourcePost[];
  summary: {
    totalSources: number;
    activeSources: number;
    totalPosts: number;
    lastSyncedAt?: string | null;
  };
}

export interface SocialSourceSyncResult {
  source: ISocialSource;
  posts: ISourcePost[];
  count: number;
}

export interface SocialSourceSyncFailure {
  error: string;
  sourceId: string;
}

export interface SocialSourceBrandSyncResult {
  count: number;
  failures: SocialSourceSyncFailure[];
  results: SocialSourceSyncResult[];
}

export interface SocialSourceValidationResult {
  avatarUrl?: string | null;
  displayName?: string | null;
  error?: string;
  externalId?: string | null;
  followersCount?: number | null;
  handle?: string;
  platform?: SocialSourcePlatform | string;
  profileUrl?: string;
  valid: boolean;
}

export interface SocialPostImportResult {
  deduplicated: boolean;
  post: ISourcePost;
  source: ISocialSource;
}

export const MAX_LISTENING_ATTRIBUTION_EVIDENCE_IDS = 100;

export interface ListeningPostAttributionInput {
  listeningTopicId: string;
  listeningThemeId: string;
  listeningEvidenceIds: string[];
}

export interface SourcePostDraftActionInput
  extends Partial<ListeningPostAttributionInput> {
  actionType?: SourcePostActionType | string;
  /** Which of the brand's accounts on this platform the draft publishes as. */
  credentialId?: string;
  text?: string;
}

export interface SourcePostDraftActionResult {
  draftId: string;
  post: unknown;
}
