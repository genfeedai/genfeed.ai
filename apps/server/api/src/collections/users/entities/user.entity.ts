import { Setting } from '@api/collections/settings/schemas/setting.schema';
import { User } from '@api/collections/users/schemas/user.schema';
import { BaseEntity } from '@api/shared/entities/base/base.entity';
import { AppSource } from '@genfeedai/enums';

export class UserEntity extends BaseEntity implements User {
  declare readonly clerkId?: string;
  declare readonly handle: string;
  declare readonly firstName?: string;
  declare readonly lastName?: string;
  declare readonly email?: string;
  declare readonly avatar?: string;

  declare readonly isInvited?: boolean;

  declare readonly appSource: AppSource;
  declare readonly stripeCustomerId?: string;
  declare readonly isOnboardingCompleted: boolean;
  declare readonly onboardingStartedAt?: Date;
  declare readonly onboardingCompletedAt?: Date;
  declare readonly onboardingType?: 'creator' | 'organization';
  declare readonly onboardingStepsCompleted: string[];

  declare readonly settings?: Setting;
}
