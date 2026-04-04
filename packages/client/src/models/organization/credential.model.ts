import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type { CredentialPlatform } from '@genfeedai/enums';
import type {
  ICredential,
  ICredentialInstagram,
  ICredentialOAuth,
  IOrganization,
  ITag,
  IUser,
} from '@genfeedai/interfaces';

export class BaseCredential extends BaseEntity implements ICredential {
  public declare user: IUser;
  public declare organization: IOrganization;
  public declare tags: ITag[];
  public declare platform: CredentialPlatform;
  public declare brand: string;
  public declare externalId: string;
  public declare externalHandle: string;
  public declare handle: string;
  public declare label: string;
  public declare description?: string;
  public declare isActive: boolean;
  public declare isVerified: boolean;
  public declare token: string;
  public declare tokenExpiry?: string;
  public declare accessTokenExpiry?: string;
  public declare isConnected: boolean;
  public declare accessToken?: string;
  public declare refreshToken?: string;
  public declare expiresAt?: string;
  public declare metadata?: Record<string, unknown>;

  constructor(data: Partial<ICredential> = {}) {
    super(data);
  }
}

export class BaseCredentialInstagram
  extends BaseCredential
  implements ICredentialInstagram
{
  public declare username: string;
  public declare image: string;
  public declare category: boolean;

  constructor(data: Partial<ICredentialInstagram> = {}) {
    super(data);
  }
}

export class BaseCredentialOAuth
  extends BaseCredential
  implements ICredentialOAuth
{
  public declare url: string;

  constructor(data: Partial<ICredentialOAuth> = {}) {
    super(data);
  }
}
