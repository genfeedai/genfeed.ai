import type { WorkflowInitiatingActor } from '@api/authorization/brand-access/workflow-actor.util';
import type { CredentialPlatform } from '@genfeedai/contracts';

/** API-only trusted argument, kept separate from metrics and provider/queue payloads. */
export type AnalyticsCollectionAuthorization = Readonly<{
  initiatingActor: WorkflowInitiatingActor;
  admit: () => Promise<void>;
}>;

export type AnalyticsCollectionPost = {
  brandId: string;
  credentialId?: string;
  externalId: string;
  id: string;
  isVideo?: boolean;
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
