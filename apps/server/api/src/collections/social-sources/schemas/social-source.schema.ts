import type { SocialSourcePlatform, SocialSourceType } from '@genfeedai/enums';

export interface SocialSourceDocument {
  id: string;
  _id?: string;
  mongoId?: string | null;
  organizationId: string;
  organization?: string | { id?: string } | null;
  brandId: string;
  brand?: string | { id?: string } | null;
  userId: string;
  user?: string | { id?: string } | null;
  credentialId?: string | null;
  credential?: string | { id?: string } | null;
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
  lastSyncedAt?: Date | string | null;
  lastSyncStatus?: string | null;
  lastSyncError?: string | null;
  lastPostExternalId?: string | null;
  metadata?: Record<string, unknown>;
  isDeleted?: boolean;
  createdAt?: Date | string;
  updatedAt?: Date | string;
  [key: string]: unknown;
}
