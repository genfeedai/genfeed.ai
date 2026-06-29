import type { CredentialPlatform } from '@genfeedai/enums';

export type IntegrationProviderKey =
  | 'google_ads'
  | 'google_search_console'
  | 'linkedin'
  | 'meta_ads'
  | 'twitter'
  | 'unipile';

export type IntegrationProviderAuthMode = 'api_key' | 'oauth1' | 'oauth2';

export type IntegrationProviderCapability =
  | 'connect_account'
  | 'create_calendar_event'
  | 'fetch_account'
  | 'fetch_analytics'
  | 'fetch_campaigns'
  | 'manage_ads'
  | 'publish_post'
  | 'read_calendar_events'
  | 'read_email'
  | 'read_message'
  | 'send_email'
  | 'send_message';

export interface IntegrationProviderCredentialField {
  description?: string;
  example?: string;
  key: string;
  label: string;
  required: boolean;
  secret: boolean;
}

export interface IntegrationProviderOAuthConfig {
  authorizationUrl: string;
  scopes: string[];
  tokenUrl?: string;
}

export interface IntegrationProviderRetryConfig {
  baseDelayMs: number;
  maxAttempts: number;
  retryAfterHeaders: string[];
  retryableStatusCodes: number[];
}

export interface IntegrationProviderEndpoints {
  apiBaseUrl: string;
  appBaseUrl?: string;
}

export interface IntegrationProviderDefinition {
  authMode: IntegrationProviderAuthMode;
  capabilities: IntegrationProviderCapability[];
  credentialFields: IntegrationProviderCredentialField[];
  displayName: string;
  docsUrl: string;
  endpoints: IntegrationProviderEndpoints;
  key: IntegrationProviderKey;
  oauth?: IntegrationProviderOAuthConfig;
  platform: CredentialPlatform;
  retry: IntegrationProviderRetryConfig;
  setupGuideUrl?: string;
}

function hasString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function validateIntegrationProviderDefinition(
  provider: IntegrationProviderDefinition,
): string[] {
  const errors: string[] = [];

  if (!hasString(provider.key)) {
    errors.push('key is required');
  }

  if (!hasString(provider.displayName)) {
    errors.push(`${provider.key}: displayName is required`);
  }

  if (!hasString(provider.endpoints.apiBaseUrl)) {
    errors.push(`${provider.key}: endpoints.apiBaseUrl is required`);
  }

  if (provider.capabilities.length === 0) {
    errors.push(`${provider.key}: at least one capability is required`);
  }

  if (provider.retry.maxAttempts < 1) {
    errors.push(`${provider.key}: retry.maxAttempts must be at least 1`);
  }

  if (provider.retry.baseDelayMs < 0) {
    errors.push(`${provider.key}: retry.baseDelayMs cannot be negative`);
  }

  if (provider.authMode === 'oauth2' && !provider.oauth) {
    errors.push(`${provider.key}: oauth config is required for oauth2`);
  }

  if (provider.oauth && !hasString(provider.oauth.authorizationUrl)) {
    errors.push(`${provider.key}: oauth.authorizationUrl is required`);
  }

  return errors;
}

export function providerSupportsCapability(
  provider: IntegrationProviderDefinition,
  capability: IntegrationProviderCapability,
): boolean {
  return provider.capabilities.includes(capability);
}
