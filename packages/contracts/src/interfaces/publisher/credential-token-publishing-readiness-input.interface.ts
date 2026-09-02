import type {
  IPublishingDiagnostic,
  IPublishingProviderReadiness,
  PublishingSetupCheckStatus,
} from './publishing-readiness.interface';

export interface CredentialTokenPublishingReadinessInput {
  accessToken?: string | null;
  accessTokenExpiresAt?: Date | string | null;
  accessTokenSecret?: string | null;
  /** Provider app-review signal; resolved from config, not from the token. */
  appReviewStatus?: PublishingSetupCheckStatus;
  /** OAuth callback signal; resolved from config, not from the token. */
  callbackUrlStatus?: PublishingSetupCheckStatus;
  credentialId: string;
  isConnected: boolean;
  now?: Date;
  oauthToken?: string | null;
  oauthTokenSecret?: string | null;
  permissionScopeStatus?: PublishingSetupCheckStatus;
  providerKey: IPublishingProviderReadiness['providerKey'];
  quotaStatus?: PublishingSetupCheckStatus;
  refreshToken?: string | null;
  refreshTokenExpiresAt?: Date | string | null;
  /**
   * Non-token diagnostics (setup, quota) merged into every return path, so a
   * disconnected credential still reports the deployment problems behind it.
   */
  setupDiagnostics?: readonly IPublishingDiagnostic[];
}
