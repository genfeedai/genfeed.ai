import type { CredentialPlatform } from '@genfeedai/enums';
import type { IBaseEntity, IOrganization, ITag, IUser } from '../index';
import type { AccountHealthSummary } from './account-health.interface';

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

  accountHealth?: AccountHealthSummary;
  warmupAssessedAt?: string;
  warmupHoldReason?: string;
  warmupManualOverride?: boolean;
  warmupOverrideConfirmedAt?: string;
  warmupOverrideConfirmedByUserId?: string;
  warmupOverrideReason?: string;
  warmupOverrideUntil?: string;
  warmupRiskLevel?: AccountHealthSummary['riskLevel'];
  warmupScore?: number;
  warmupSignals?: Partial<AccountHealthSummary['signals']>;
  warmupState?: AccountHealthSummary['state'];
  warmupThresholds?: Partial<AccountHealthSummary['thresholds']>;

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
