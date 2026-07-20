import type { IPublishingProviderReadiness } from './publishing-readiness.interface';

export interface CredentialTokenPublishingReadinessInput {
  accessToken?: string | null;
  accessTokenExpiresAt?: Date | string | null;
  accessTokenSecret?: string | null;
  credentialId: string;
  isConnected: boolean;
  now?: Date;
  oauthToken?: string | null;
  oauthTokenSecret?: string | null;
  providerKey: IPublishingProviderReadiness['providerKey'];
  refreshToken?: string | null;
  refreshTokenExpiresAt?: Date | string | null;
}
