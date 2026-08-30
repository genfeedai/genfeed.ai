import type { IBaseEntity } from '../core/base.interface';
import type {
  AdsChannel,
  AdsResearchPatternSummary,
  AdsResearchPlatform,
} from '../integrations/ads-research.interface';

export type SavedAdSource = 'public' | 'my_accounts';

export interface ISavedAd extends IBaseEntity {
  organizationId: string;
  brandId: string;
  userId: string;
  source: SavedAdSource;
  platform: AdsResearchPlatform;
  sourceAdId: string;
  sourceRecordId?: string | null;
  channel: AdsChannel;
  credentialId?: string | null;
  adAccountId?: string | null;
  loginCustomerId?: string | null;
  advertiserId?: string | null;
  advertiserName?: string | null;
  title: string;
  headline?: string | null;
  body?: string | null;
  cta?: string | null;
  explanation: string;
  landingPageUrl?: string | null;
  previewUrl?: string | null;
  imageUrls: string[];
  videoUrls: string[];
  metrics: Record<string, number>;
  patternSummary: AdsResearchPatternSummary[];
  usagePolicy: 'remix_allowed' | 'disclosure_only';
  firstSeenAt?: string | null;
  lastSeenAt?: string | null;
  capturedAt: string;
  note?: string | null;
}

export interface SaveAdInput {
  brandId: string;
  source: SavedAdSource;
  adId: string;
  platform?: AdsResearchPlatform;
  channel?: AdsChannel;
  credentialId?: string;
  adAccountId?: string;
  loginCustomerId?: string;
}

export interface UpdateSavedAdNoteInput {
  brandId: string;
  id: string;
  note?: string | null;
}

export interface UnsaveSavedAdInput {
  brandId: string;
  id: string;
}
