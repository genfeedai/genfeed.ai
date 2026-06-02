import { CredentialPlatform } from '@genfeedai/enums';

import type {
  IntegrationProviderDefinition,
  IntegrationProviderKey,
} from './provider.schema';
import { validateIntegrationProviderDefinition } from './provider.schema';

const DEFAULT_RETRY = {
  baseDelayMs: 500,
  maxAttempts: 3,
  retryAfterHeaders: ['retry-after', 'x-rate-limit-reset'],
  retryableStatusCodes: [408, 425, 429, 500, 502, 503, 504],
};

export const INTEGRATION_PROVIDER_DEFINITIONS = [
  {
    authMode: 'oauth2',
    capabilities: ['fetch_account', 'publish_post', 'fetch_analytics'],
    credentialFields: [
      {
        description: 'OAuth client ID from the LinkedIn developer app.',
        key: 'clientId',
        label: 'Client ID',
        required: true,
        secret: false,
      },
      {
        description: 'OAuth client secret from the LinkedIn developer app.',
        key: 'clientSecret',
        label: 'Client Secret',
        required: true,
        secret: true,
      },
    ],
    displayName: 'LinkedIn',
    docsUrl: 'https://learn.microsoft.com/linkedin/',
    endpoints: {
      apiBaseUrl: 'https://api.linkedin.com/v2',
      appBaseUrl: 'https://www.linkedin.com',
    },
    key: 'linkedin',
    oauth: {
      authorizationUrl: 'https://www.linkedin.com/oauth/v2/authorization',
      scopes: ['openid', 'profile', 'w_member_social'],
      tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
    },
    platform: CredentialPlatform.LINKEDIN,
    retry: DEFAULT_RETRY,
    setupGuideUrl:
      'https://learn.microsoft.com/linkedin/shared/authentication/authentication',
  },
  {
    authMode: 'oauth2',
    capabilities: ['fetch_account', 'publish_post', 'fetch_analytics'],
    credentialFields: [
      {
        description: 'OAuth 2.0 client ID from the X developer portal.',
        key: 'clientId',
        label: 'Client ID',
        required: true,
        secret: false,
      },
      {
        description: 'OAuth 2.0 client secret from the X developer portal.',
        key: 'clientSecret',
        label: 'Client Secret',
        required: true,
        secret: true,
      },
      {
        description: 'Bearer token for app-level read APIs.',
        key: 'bearerToken',
        label: 'Bearer Token',
        required: false,
        secret: true,
      },
    ],
    displayName: 'X',
    docsUrl: 'https://developer.x.com/en/docs',
    endpoints: {
      apiBaseUrl: 'https://api.twitter.com/2',
      appBaseUrl: 'https://x.com',
    },
    key: 'twitter',
    oauth: {
      authorizationUrl: 'https://twitter.com/i/oauth2/authorize',
      scopes: ['tweet.read', 'tweet.write', 'users.read', 'offline.access'],
      tokenUrl: 'https://api.twitter.com/2/oauth2/token',
    },
    platform: CredentialPlatform.TWITTER,
    retry: DEFAULT_RETRY,
    setupGuideUrl: 'https://developer.x.com/en/docs/authentication/oauth-2-0',
  },
  {
    authMode: 'oauth2',
    capabilities: [
      'fetch_account',
      'fetch_campaigns',
      'fetch_analytics',
      'manage_ads',
    ],
    credentialFields: [
      {
        description: 'Google OAuth client ID.',
        key: 'clientId',
        label: 'Client ID',
        required: true,
        secret: false,
      },
      {
        description: 'Google OAuth client secret.',
        key: 'clientSecret',
        label: 'Client Secret',
        required: true,
        secret: true,
      },
      {
        description: 'Google Ads developer token.',
        key: 'developerToken',
        label: 'Developer Token',
        required: true,
        secret: true,
      },
    ],
    displayName: 'Google Ads',
    docsUrl: 'https://developers.google.com/google-ads/api/docs/start',
    endpoints: {
      apiBaseUrl: 'https://googleads.googleapis.com',
      appBaseUrl: 'https://ads.google.com',
    },
    key: 'google_ads',
    oauth: {
      authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      scopes: ['https://www.googleapis.com/auth/adwords'],
      tokenUrl: 'https://oauth2.googleapis.com/token',
    },
    platform: CredentialPlatform.GOOGLE_ADS,
    retry: DEFAULT_RETRY,
    setupGuideUrl:
      'https://developers.google.com/google-ads/api/docs/oauth/overview',
  },
  {
    authMode: 'oauth2',
    capabilities: [
      'fetch_account',
      'fetch_campaigns',
      'fetch_analytics',
      'manage_ads',
    ],
    credentialFields: [
      {
        description: 'Meta app ID.',
        key: 'appId',
        label: 'App ID',
        required: true,
        secret: false,
      },
      {
        description: 'Meta app secret.',
        key: 'appSecret',
        label: 'App Secret',
        required: true,
        secret: true,
      },
    ],
    displayName: 'Meta Ads',
    docsUrl: 'https://developers.facebook.com/docs/marketing-apis/',
    endpoints: {
      apiBaseUrl: 'https://graph.facebook.com',
      appBaseUrl: 'https://business.facebook.com',
    },
    key: 'meta_ads',
    oauth: {
      authorizationUrl: 'https://www.facebook.com/v24.0/dialog/oauth',
      scopes: ['ads_management', 'ads_read'],
      tokenUrl: 'https://graph.facebook.com/v24.0/oauth/access_token',
    },
    platform: CredentialPlatform.FACEBOOK,
    retry: DEFAULT_RETRY,
    setupGuideUrl:
      'https://developers.facebook.com/docs/marketing-apis/get-started',
  },
] satisfies IntegrationProviderDefinition[];

const PROVIDERS_BY_KEY = new Map<
  IntegrationProviderKey,
  IntegrationProviderDefinition
>(INTEGRATION_PROVIDER_DEFINITIONS.map((provider) => [provider.key, provider]));

export function listIntegrationProviderDefinitions(): IntegrationProviderDefinition[] {
  return [...INTEGRATION_PROVIDER_DEFINITIONS];
}

export function getIntegrationProviderDefinition(
  key: IntegrationProviderKey,
): IntegrationProviderDefinition | undefined {
  return PROVIDERS_BY_KEY.get(key);
}

export function assertValidIntegrationProviderCatalog(): void {
  const errors = INTEGRATION_PROVIDER_DEFINITIONS.flatMap((provider) =>
    validateIntegrationProviderDefinition(provider),
  );

  if (errors.length > 0) {
    throw new Error(
      `Invalid integration provider catalog: ${errors.join('; ')}`,
    );
  }
}
