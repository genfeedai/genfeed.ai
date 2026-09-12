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
  /**
   * True when a provider token was saved but never resolved to a specific
   * account (see `computeNeedsAccountSelection`). The caller should let the
   * operator choose an account (Instagram: `POST
   * /services/instagram/:credentialId/select-account`) instead of treating
   * this connection as complete.
   */
  needsAccountSelection?: boolean;
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
  /**
   * True when this candidate's externalId is already held by another live
   * (connected) credential of this brand — choosing it merges this
   * connection into that incumbent rather than creating a new account.
   * Computed server-side in `findAllInstagramPages`, the same exclusion
   * `InstagramController.resolveAuthorizedAccount` already applies when
   * auto-resolving.
   */
  isAlreadyConnected?: boolean;
}

export interface ICredentialOAuth extends ICredential {
  url: string;
}
