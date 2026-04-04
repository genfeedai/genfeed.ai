import { ISetting } from '../automation';
import type { IBaseEntity } from '../core/base.interface';

export type OnboardingType = 'creator' | 'organization';

export interface IUser extends IBaseEntity {
  clerkId: string;
  handle: string;
  firstName: string;
  lastName: string;
  email: string;
  avatar?: string;
  settings: ISetting;
  fullName?: string;
  isOnboardingCompleted?: boolean;
  onboardingStartedAt?: Date;
  onboardingCompletedAt?: Date;
  onboardingType?: OnboardingType;
  onboardingStepsCompleted?: string[];
}
