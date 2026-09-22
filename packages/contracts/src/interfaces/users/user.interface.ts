import type { OnboardingType, PlatformRole } from '../..';
import type { ISetting } from '../automation';
import type { IBaseEntity } from '../core/base.interface';

export interface IUser extends IBaseEntity {
  handle: string;
  firstName: string;
  lastName: string;
  name?: string | null;
  email: string;
  lastActiveAt?: string | null;
  // Platform access role; SUPERADMIN gates /admin surfaces and impersonation.
  platformRole?: PlatformRole;
  avatar?: string;
  settings: ISetting;
  fullName?: string;
  isOnboardingCompleted?: boolean;
  onboardingStartedAt?: Date;
  onboardingCompletedAt?: Date;
  onboardingType?: OnboardingType;
  onboardingStepsCompleted?: string[];
  // First-asset unlock gate: per-user "explore anyway" escape hatch.
  hasDismissedAssetGate?: boolean;
  // First-touch acquisition source; absent when it was never captured.
  signupAttribution?: IUserSignupAttribution | null;
}

/**
 * First-touch acquisition source for a signup. Only the external referring
 * domain and the landing path are kept, never full URLs or query strings.
 */
export interface ISignupAttribution {
  referrerDomain?: string;
  landingPath?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
}

export interface IUserSignupAttribution
  extends IBaseEntity,
    ISignupAttribution {}
