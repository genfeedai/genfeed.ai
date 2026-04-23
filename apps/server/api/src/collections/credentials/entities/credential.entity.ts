import type { Credential } from '@api/collections/credentials/schemas/credential.schema';
import { BaseEntity } from '@api/shared/entities/base/base.entity';

export class CredentialEntity extends BaseEntity implements Credential {
  declare readonly id: string;
  declare readonly mongoId: string | null;
  declare readonly userId: string;
  declare readonly organizationId: string;
  declare readonly brandId: string | null;
  declare readonly username: Credential['username'];
  declare readonly user: string;
  declare readonly brand: string;
  declare readonly organization: string;
  declare readonly tags: string[];

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

  declare readonly label: Credential['label'];
  declare readonly description: Credential['description'];

  declare readonly isConnected: boolean;
}
