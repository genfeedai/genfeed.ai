import type { CredentialPlatform } from '@genfeedai/enums';
import type { AccountHealthSummary } from '../organization/account-health.interface';
import type { IPublishingProviderReadiness } from '../publisher/publishing-readiness.interface';

export type ContentSurface =
  | 'post'
  | 'thread'
  | 'newsletter'
  | 'article'
  | 'x-article'
  | 'image'
  | 'video';

export type Publishability = 'publishable' | 'copy_only' | 'unsupported';

export type SocialGenerationFormat = 'post' | 'thread';

export interface AccountPublishingConstraints {
  maxCharacters?: number;
  maxWeightedCharacters?: number;
  supportsDirectPublishing: boolean;
  supportsRichArticleCopy: boolean;
  supportsThreads: boolean;
  usesWeightedCharacters: boolean;
  notes: string[];
}

export interface AccountPublishingContextAccount {
  id: string;
  label: string;
  platform: CredentialPlatform;
  handle?: string;
  externalUrl?: string;
}

export interface AccountPublishingContextBrand {
  id: string;
  label?: string;
  slug?: string;
  description?: string;
  voice?: string;
  agentConfig?: Record<string, unknown>;
}

export interface AccountPublishingRecentPost {
  id: string;
  label?: string;
  description: string;
  platform: CredentialPlatform;
  status?: string;
  createdAt?: string;
}

export interface AccountPublishingSourceLineage {
  sourceReferenceIds?: string[];
  sourceUrl?: string;
  trendId?: string;
}

export interface AccountPublishingContext {
  account: AccountPublishingContextAccount;
  accountHealth?: AccountHealthSummary;
  brand: AccountPublishingContextBrand;
  constraints: AccountPublishingConstraints;
  promptHints: string[];
  publishability: Publishability;
  readiness: IPublishingProviderReadiness;
  recentPosts: AccountPublishingRecentPost[];
  sourceLineage?: AccountPublishingSourceLineage;
  surface: ContentSurface;
}
