import type { CredentialPlatform } from '../..';
import type { IBaseEntity, IBrand, IOrganization, ITag, IUser } from '../index';
import type { AccountHealthSummary } from './account-health.interface';

export interface IClockTime {
  hour: number;
  minute: number;
}

export interface ICredentialPostingTimes {
  times: IClockTime[];
}

export interface INextPostingSlot {
  found: boolean;
  hour?: number;
  instant?: string;
  minute?: number;
  timezone?: string;
}

export interface ICredential extends IBaseEntity {
  userId: string | null;
  organizationId: string | null;
  brandId: string | null;
  user?: IUser;
  organization?: IOrganization;
  brand?: IBrand;

  externalId?: string | null;
  externalHandle?: string | null;
  externalName?: string | null;
  externalAvatar?: string | null;
  externalUrl?: string;

  platform: CredentialPlatform;
  accessTokenExpiry?: string | null;

  label?: string | null;
  description?: string | null;
  postingTimes?: IClockTime[];
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
