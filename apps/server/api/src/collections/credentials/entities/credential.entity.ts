import type { Credential } from '@api/collections/credentials/schemas/credential.schema';
import { BaseEntity } from '@api/shared/entities/base/base.entity';
import { CredentialPlatform } from '@genfeedai/enums';
import { Types } from 'mongoose';

export class CredentialEntity extends BaseEntity implements Credential {
  declare readonly user: Types.ObjectId;
  declare readonly brand: Types.ObjectId;
  declare readonly organization: Types.ObjectId;
  declare readonly tags: Types.ObjectId[];

  declare readonly platform: CredentialPlatform;
  declare readonly externalId: string;
  declare readonly externalHandle: string;
  declare readonly oauthToken: string;
  declare readonly oauthTokenHash: string;
  declare readonly oauthTokenSecret: string;
  declare readonly accessToken: string;
  declare readonly accessTokenSecret: string;
  declare readonly accessTokenExpiry: Date;
  declare readonly refreshToken: string;
  declare readonly refreshTokenExpiry: Date;

  declare readonly label: string;
  declare readonly description: string;

  declare readonly isConnected: boolean;
}
