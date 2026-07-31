import { CredentialPlatform } from '@genfeedai/enums';

/**
 * Declarative map of the OAuth app-level environment a publishing provider
 * needs before any brand can connect an account to it.
 *
 * Keys mirror `packages/config/src/schemas/social.schema.ts` — the checklist
 * only ever reads presence and URL *shape*, never the values themselves.
 */
export interface PublishingProviderEnvDescriptor {
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
}

export const PUBLISHING_PROVIDER_ENV_DESCRIPTORS: readonly PublishingProviderEnvDescriptor[] =
  [
    {
      clientIdKeys: ['YOUTUBE_CLIENT_ID'],
      clientSecretKeys: ['YOUTUBE_CLIENT_SECRET'],
      label: 'YouTube',
      platform: CredentialPlatform.YOUTUBE,
      redirectUriKeys: ['YOUTUBE_REDIRECT_URI'],
    },
    {
      clientIdKeys: ['INSTAGRAM_APP_ID'],
      clientSecretKeys: ['INSTAGRAM_APP_SECRET'],
      label: 'Instagram',
      platform: CredentialPlatform.INSTAGRAM,
      redirectUriKeys: ['INSTAGRAM_REDIRECT_URI'],
    },
    {
      clientIdKeys: ['TIKTOK_CLIENT_KEY'],
      clientSecretKeys: ['TIKTOK_CLIENT_SECRET'],
      label: 'TikTok',
      platform: CredentialPlatform.TIKTOK,
      redirectUriKeys: [],
    },
    {
      clientIdKeys: ['FACEBOOK_APP_ID'],
      clientSecretKeys: ['FACEBOOK_APP_SECRET'],
      label: 'Facebook',
      platform: CredentialPlatform.FACEBOOK,
      redirectUriKeys: ['FACEBOOK_REDIRECT_URI'],
    },
    {
      clientIdKeys: ['TWITTER_CLIENT_ID'],
      clientSecretKeys: ['TWITTER_CLIENT_SECRET'],
      label: 'X (Twitter)',
      platform: CredentialPlatform.TWITTER,
      redirectUriKeys: ['TWITTER_REDIRECT_URI'],
    },
    {
      clientIdKeys: ['LINKEDIN_CLIENT_ID'],
      clientSecretKeys: ['LINKEDIN_CLIENT_SECRET'],
      label: 'LinkedIn',
      platform: CredentialPlatform.LINKEDIN,
      redirectUriKeys: ['LINKEDIN_REDIRECT_URI'],
    },
    {
      clientIdKeys: ['PINTEREST_CLIENT_ID'],
      clientSecretKeys: ['PINTEREST_CLIENT_SECRET'],
      label: 'Pinterest',
      platform: CredentialPlatform.PINTEREST,
      redirectUriKeys: ['PINTEREST_REDIRECT_URI'],
    },
    {
      clientIdKeys: ['REDDIT_CLIENT_ID'],
      clientSecretKeys: ['REDDIT_CLIENT_SECRET'],
      label: 'Reddit',
      platform: CredentialPlatform.REDDIT,
      redirectUriKeys: ['REDDIT_REDIRECT_URI'],
    },
    {
      clientIdKeys: ['MEDIUM_CLIENT_ID'],
      clientSecretKeys: ['MEDIUM_CLIENT_SECRET'],
      label: 'Medium',
      platform: CredentialPlatform.MEDIUM,
      redirectUriKeys: ['MEDIUM_REDIRECT_URI'],
    },
    {
      clientIdKeys: ['FANVUE_CLIENT_ID'],
      clientSecretKeys: ['FANVUE_CLIENT_SECRET'],
      label: 'Fanvue',
      platform: CredentialPlatform.FANVUE,
      redirectUriKeys: ['FANVUE_REDIRECT_URI'],
    },
    {
      clientIdKeys: ['SLACK_CLIENT_ID'],
      clientSecretKeys: ['SLACK_CLIENT_SECRET'],
      label: 'Slack',
      platform: CredentialPlatform.SLACK,
      redirectUriKeys: ['SLACK_REDIRECT_URI'],
    },
    {
      clientIdKeys: ['WORDPRESS_CLIENT_ID'],
      clientSecretKeys: ['WORDPRESS_CLIENT_SECRET'],
      label: 'WordPress.com',
      platform: CredentialPlatform.WORDPRESS,
      redirectUriKeys: ['WORDPRESS_REDIRECT_URI'],
    },
    {
      clientIdKeys: ['SNAPCHAT_CLIENT_ID'],
      clientSecretKeys: ['SNAPCHAT_CLIENT_SECRET'],
      label: 'Snapchat',
      platform: CredentialPlatform.SNAPCHAT,
      redirectUriKeys: ['SNAPCHAT_REDIRECT_URI'],
    },
    {
      clientIdKeys: ['SHOPIFY_CLIENT_ID'],
      clientSecretKeys: ['SHOPIFY_CLIENT_SECRET'],
      label: 'Shopify',
      platform: CredentialPlatform.SHOPIFY,
      redirectUriKeys: ['SHOPIFY_REDIRECT_URI'],
    },
  ];
