import type { CredentialPlatform } from '@genfeedai/contracts';

export type AnalyticsCollectionPost = {
  brandId: string;
  credentialId?: string;
  externalId: string;
  id: string;
  organizationId: string;
  platform: CredentialPlatform;
};

export type SocialAnalyticsCollectionInput = {
  attemptKey?: string;
  posts: AnalyticsCollectionPost[];
};

export type TwitterAnalyticsCollectionInput = {
  attemptKey?: string;
  credentialId: string;
  posts: Array<Omit<AnalyticsCollectionPost, 'credentialId' | 'platform'>>;
};

export type YouTubeAnalyticsCollectionInput = {
  attemptKey?: string;
  brandId: string;
  credentialId?: string;
  organizationId: string;
  posts: Array<Omit<AnalyticsCollectionPost, 'credentialId' | 'platform'>>;
};
