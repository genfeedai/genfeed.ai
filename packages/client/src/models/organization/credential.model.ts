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
  declare public userId: string | null;
  declare public organizationId: string | null;
  declare public brandId: string | null;
  declare public user?: IUser;
  declare public organization?: IOrganization;
  declare public brand?: IBrand;
  declare public tags: ITag[];
  declare public platform: CredentialPlatform;
  declare public externalId?: string | null;
  declare public externalHandle?: string | null;
  declare public externalName?: string | null;
  declare public externalAvatar?: string | null;
  declare public label?: string | null;
  declare public description?: string | null;
  declare public postingTimes?: IClockTime[];
  declare public accessTokenExpiry?: string | null;
  declare public isConnected: boolean;

  constructor(data: Partial<ICredential> = {}) {
    super(data);
  }
}

export class BaseCredentialInstagram
  extends BaseCredential
  implements ICredentialInstagram
{
  declare public label: string;
  declare public username: string;
  declare public image: string;
  declare public category: boolean;

  constructor(data: Partial<ICredentialInstagram> = {}) {
    super(data);
  }
}

export class BaseCredentialOAuth
  extends BaseCredential
  implements ICredentialOAuth
{
  declare public url: string;

  constructor(data: Partial<ICredentialOAuth> = {}) {
    super(data);
  }
}
