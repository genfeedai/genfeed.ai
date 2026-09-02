import type { Credential } from '@api/collections/credentials/schemas/credential.schema';
import { BaseEntity } from '@api/entities/base.entity';

export class CredentialEntity extends BaseEntity implements Credential {
  declare readonly id: string;
  declare readonly userId: Credential['userId'];
  declare readonly organizationId: Credential['organizationId'];
  declare readonly brandId: Credential['brandId'];
  declare readonly username: Credential['username'];

  declare readonly platform: Credential['platform'];
  declare readonly externalId: Credential['externalId'];
  declare readonly externalHandle: Credential['externalHandle'];
  declare readonly externalName: Credential['externalName'];
  declare readonly externalAvatar: Credential['externalAvatar'];
  declare readonly oauthState: Credential['oauthState'];
  declare readonly oauthToken: Credential['oauthToken'];
  declare readonly oauthTokenHash: Credential['oauthTokenHash'];
  declare readonly oauthTokenSecret: Credential['oauthTokenSecret'];
  declare readonly accessToken: Credential['accessToken'];
  declare readonly accessTokenSecret: Credential['accessTokenSecret'];
  declare readonly accessTokenExpiry: Credential['accessTokenExpiry'];
  declare readonly refreshToken: Credential['refreshToken'];
  declare readonly refreshTokenExpiry: Credential['refreshTokenExpiry'];
  declare readonly grantedScopes: Credential['grantedScopes'];
  declare readonly grantedScopesCapturedAt: Credential['grantedScopesCapturedAt'];

  declare readonly label: Credential['label'];
  declare readonly description: Credential['description'];
  declare readonly postingTimes: Credential['postingTimes'];

  declare readonly warmupState: Credential['warmupState'];
  declare readonly warmupScore: Credential['warmupScore'];
  declare readonly warmupRiskLevel: Credential['warmupRiskLevel'];
  declare readonly warmupSignals: Credential['warmupSignals'];
  declare readonly warmupThresholds: Credential['warmupThresholds'];
  declare readonly warmupAssessedAt: Credential['warmupAssessedAt'];
  declare readonly warmupHoldReason: Credential['warmupHoldReason'];
  declare readonly warmupManualOverride: Credential['warmupManualOverride'];
  declare readonly warmupOverrideReason: Credential['warmupOverrideReason'];
  declare readonly warmupOverrideUntil: Credential['warmupOverrideUntil'];
  declare readonly warmupOverrideConfirmedAt: Credential['warmupOverrideConfirmedAt'];
  declare readonly warmupOverrideConfirmedByUserId: Credential['warmupOverrideConfirmedByUserId'];

  declare readonly isConnected: boolean;
}
