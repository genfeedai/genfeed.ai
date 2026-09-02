import { CredentialPlatform } from '@genfeedai/enums';

/**
 * Declarative map of the OAuth app-level environment a publishing provider
 * needs before any brand can connect an account to it.
 *
 * Keys mirror `packages/config/src/schemas/social.schema.ts` — the checklist
 * only ever reads presence and URL *shape*, never the values themselves.
 */
export interface PublishingProviderEnvDescriptor {
  /**
   * Name of the platform's approval program, used verbatim in the diagnostic
   * message. Present exactly when `requiresAppReview` is true.
   */
  appReviewProgram?: string;
  /** Any one of these satisfies the app-identifier requirement. */
  clientIdKeys: readonly string[];
  /** Any one of these satisfies the app-secret requirement. */
  clientSecretKeys: readonly string[];
  label: string;
  platform: CredentialPlatform;
  /**
   * Explicit redirect-URI keys. Empty means the integration derives its
   * callback from `GENFEEDAI_APP_URL` (e.g. TikTok), so the shared app-URL
   * check already covers it.
   */
  redirectUriKeys: readonly string[];
  /**
   * Whether the platform gates production publishing behind an external review
   * or access tier we cannot observe. Approval state itself is operator-owned
   * (see #2086); this flag only says whether the question applies.
   */
  requiresAppReview: boolean;
}

export const PUBLISHING_PROVIDER_ENV_DESCRIPTORS: readonly PublishingProviderEnvDescriptor[] =
  [
    {
      appReviewProgram: 'Google OAuth verification',
      clientIdKeys: ['GOOGLE_OAUTH_CLIENT_ID'],
      clientSecretKeys: ['GOOGLE_OAUTH_CLIENT_SECRET'],
      label: 'YouTube',
      platform: CredentialPlatform.YOUTUBE,
      redirectUriKeys: ['YOUTUBE_REDIRECT_URI'],
      requiresAppReview: true,
    },
    {
      appReviewProgram: 'Meta App Review',
      clientIdKeys: ['INSTAGRAM_APP_ID'],
      clientSecretKeys: ['INSTAGRAM_APP_SECRET'],
      label: 'Instagram',
      platform: CredentialPlatform.INSTAGRAM,
      redirectUriKeys: ['INSTAGRAM_REDIRECT_URI'],
      requiresAppReview: true,
    },
    {
      appReviewProgram: 'TikTok content-posting scope audit',
      clientIdKeys: ['TIKTOK_CLIENT_KEY'],
      clientSecretKeys: ['TIKTOK_CLIENT_SECRET'],
      label: 'TikTok',
      platform: CredentialPlatform.TIKTOK,
      redirectUriKeys: [],
      requiresAppReview: true,
    },
    {
      appReviewProgram: 'Meta App Review',
      clientIdKeys: ['FACEBOOK_APP_ID'],
      clientSecretKeys: ['FACEBOOK_APP_SECRET'],
      label: 'Facebook',
      platform: CredentialPlatform.FACEBOOK,
      redirectUriKeys: ['FACEBOOK_REDIRECT_URI'],
      requiresAppReview: true,
    },
    {
      appReviewProgram: 'X API access tier',
      clientIdKeys: ['TWITTER_CLIENT_ID'],
      clientSecretKeys: ['TWITTER_CLIENT_SECRET'],
      label: 'X (Twitter)',
      platform: CredentialPlatform.TWITTER,
      redirectUriKeys: ['TWITTER_REDIRECT_URI'],
      requiresAppReview: true,
    },
    {
      appReviewProgram: 'LinkedIn product access request',
      clientIdKeys: ['LINKEDIN_CLIENT_ID'],
      clientSecretKeys: ['LINKEDIN_CLIENT_SECRET'],
      label: 'LinkedIn',
      platform: CredentialPlatform.LINKEDIN,
      redirectUriKeys: ['LINKEDIN_REDIRECT_URI'],
      requiresAppReview: true,
    },
    {
      appReviewProgram: 'Pinterest standard access review',
      clientIdKeys: ['PINTEREST_CLIENT_ID'],
      clientSecretKeys: ['PINTEREST_CLIENT_SECRET'],
      label: 'Pinterest',
      platform: CredentialPlatform.PINTEREST,
      redirectUriKeys: ['PINTEREST_REDIRECT_URI'],
      requiresAppReview: true,
    },
    {
      appReviewProgram: 'Reddit API access approval',
      clientIdKeys: ['REDDIT_CLIENT_ID'],
      clientSecretKeys: ['REDDIT_CLIENT_SECRET'],
      label: 'Reddit',
      platform: CredentialPlatform.REDDIT,
      redirectUriKeys: ['REDDIT_REDIRECT_URI'],
      requiresAppReview: true,
    },
    {
      clientIdKeys: ['MEDIUM_CLIENT_ID'],
      clientSecretKeys: ['MEDIUM_CLIENT_SECRET'],
      label: 'Medium',
      platform: CredentialPlatform.MEDIUM,
      redirectUriKeys: ['MEDIUM_REDIRECT_URI'],
      requiresAppReview: false,
    },
    {
      clientIdKeys: ['FANVUE_CLIENT_ID'],
      clientSecretKeys: ['FANVUE_CLIENT_SECRET'],
      label: 'Fanvue',
      platform: CredentialPlatform.FANVUE,
      redirectUriKeys: ['FANVUE_REDIRECT_URI'],
      requiresAppReview: false,
    },
    {
      clientIdKeys: ['SLACK_CLIENT_ID'],
      clientSecretKeys: ['SLACK_CLIENT_SECRET'],
      label: 'Slack',
      platform: CredentialPlatform.SLACK,
      redirectUriKeys: ['SLACK_REDIRECT_URI'],
      requiresAppReview: false,
    },
    {
      clientIdKeys: ['WORDPRESS_CLIENT_ID'],
      clientSecretKeys: ['WORDPRESS_CLIENT_SECRET'],
      label: 'WordPress.com',
      platform: CredentialPlatform.WORDPRESS,
      redirectUriKeys: ['WORDPRESS_REDIRECT_URI'],
      requiresAppReview: false,
    },
    {
      appReviewProgram: 'Snap Kit review',
      clientIdKeys: ['SNAPCHAT_CLIENT_ID'],
      clientSecretKeys: ['SNAPCHAT_CLIENT_SECRET'],
      label: 'Snapchat',
      platform: CredentialPlatform.SNAPCHAT,
      redirectUriKeys: ['SNAPCHAT_REDIRECT_URI'],
      requiresAppReview: true,
    },
    {
      clientIdKeys: ['SHOPIFY_CLIENT_ID'],
      clientSecretKeys: ['SHOPIFY_CLIENT_SECRET'],
      label: 'Shopify',
      platform: CredentialPlatform.SHOPIFY,
      redirectUriKeys: ['SHOPIFY_REDIRECT_URI'],
      requiresAppReview: false,
    },
  ];
