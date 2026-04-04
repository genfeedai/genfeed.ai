import type { CredentialPlatform } from '@genfeedai/enums';
import type { IBaseEntity, IOrganization, ITag, IUser } from '../index';
export interface ICredential extends IBaseEntity {
    user: IUser;
    organization: IOrganization;
    brand: string;
    externalId: string;
    externalHandle: string;
    externalUrl?: string;
    platform: CredentialPlatform;
    token: string;
    tokenExpiry?: string;
    accessTokenExpiry?: string;
    label?: string;
    description?: string;
    tags?: ITag[];
    isConnected: boolean;
}
export interface ICredentialInstagram extends ICredential {
    label: string;
    username: string;
    image: string;
    platform: CredentialPlatform;
}
export interface ICredentialOAuth extends ICredential {
    url: string;
}
//# sourceMappingURL=credential.interface.d.ts.map