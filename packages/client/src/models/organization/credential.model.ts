import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type { CredentialPlatform } from '@genfeedai/contracts';
import type {
  IBrand,
  IClockTime,
  ICredential,
  ICredentialInstagram,
  ICredentialOAuth,
  IOrganization,
  ITag,
  IUser,
} from '@genfeedai/contracts/interfaces';

export class BaseCredential extends BaseEntity implements ICredential {
  public declare userId: string | null;
  public declare organizationId: string | null;
  public declare brandId: string | null;
  public declare user?: IUser;
  public declare organization?: IOrganization;
  public declare brand?: IBrand;
  public declare tags: ITag[];
  public declare platform: CredentialPlatform;
  public declare externalId?: string | null;
  public declare externalHandle?: string | null;
  public declare externalName?: string | null;
  public declare externalAvatar?: string | null;
  public declare label?: string | null;
  public declare description?: string | null;
  public declare postingTimes?: IClockTime[];
  public declare accessTokenExpiry?: string | null;
  public declare isConnected: boolean;

  constructor(data: Partial<ICredential> = {}) {
    super(data);
  }
}

export class BaseCredentialInstagram
  extends BaseCredential
  implements ICredentialInstagram
{
  public declare label: string;
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
