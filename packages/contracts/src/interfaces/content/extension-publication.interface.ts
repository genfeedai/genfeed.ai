export type ExtensionPublicationPlatform =
  | 'twitter'
  | 'linkedin'
  | 'reddit'
  | 'youtube'
  | 'instagram'
  | 'facebook'
  | 'tiktok';

export type ExtensionPublicationObservedVisibility =
  | 'public'
  | 'private'
  | 'unlisted'
  | 'unknown';

export interface ExtensionPublicationAuthor {
  externalId?: string;
  handle?: string;
}

export interface ExtensionPublicationCaptureInput {
  brandId: string;
  platform: ExtensionPublicationPlatform;
  publicationKind: 'post' | 'reply';
  url?: string;
  contextUrl?: string;
  externalId?: string;
  description: string;
  publicationDate: string;
  author?: ExtensionPublicationAuthor;
  observedVisibility?: ExtensionPublicationObservedVisibility;
}

export interface ExtensionPublicationCaptureScope {
  organizationId: string;
  userId: string;
  brandId: string;
}

export type ExtensionPublicationAnalyticsAvailability =
  | 'eligible'
  | 'missing-external-id'
  | 'missing-credential'
  | 'unsupported-platform'
  | 'unsupported-publication-kind'
  | 'provider-id-unresolved';

export interface ExtensionPublicationUrlIdentity {
  kind:
    | 'instagram-shortcode'
    | 'linkedin-activity'
    | 'facebook-post-token'
    | 'platform-publication-id';
  value: string;
}

export interface ExtensionPublicationCaptureResult {
  postId: string;
  created: boolean;
  source: string | null;
  externalId: string | null;
  url: string | null;
  contextUrl: string | null;
  urlKind: 'permalink' | 'context-only' | 'unavailable';
  credentialId: string | null;
  analyticsAvailability: ExtensionPublicationAnalyticsAvailability;
  observedVisibility: ExtensionPublicationObservedVisibility;
  urlIdentity: ExtensionPublicationUrlIdentity | null;
}
