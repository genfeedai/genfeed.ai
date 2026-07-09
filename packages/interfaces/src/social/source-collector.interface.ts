import type {
  SocialSourcePlatform,
  SocialSourceType,
  SourcePostActionType,
} from '@genfeedai/enums';
import type {
  IBaseEntity,
  IBrand,
  ICredential,
  IOrganization,
  IUser,
} from '../index';

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
  organization?: IOrganization | string;
  organizationId?: string;
  brand?: IBrand | string;
  brandId?: string;
  user?: IUser | string;
  userId?: string;
  credential?: ICredential | string | null;
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
  metadata?: Record<string, unknown>;
}

export interface ISourcePost extends IBaseEntity {
  organization?: IOrganization | string;
  organizationId?: string;
  brand?: IBrand | string;
  brandId?: string;
  user?: IUser | string | null;
  userId?: string | null;
  source?: ISocialSource | string;
  sourceId?: string;
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
  credential?: string;
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

export interface SourcePostDraftActionInput {
  actionType?: SourcePostActionType | string;
  text?: string;
}

export interface SourcePostDraftActionResult {
  draftId: string;
  post: unknown;
}
