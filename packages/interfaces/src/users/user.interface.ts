import type { OnboardingType, PlatformRole } from '@genfeedai/enums';
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
}
