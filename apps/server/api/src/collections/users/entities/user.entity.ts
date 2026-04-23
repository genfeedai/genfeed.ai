import { BaseEntity } from '@api/shared/entities/base/base.entity';
import { type Setting, type User } from '@genfeedai/prisma';

export class UserEntity extends BaseEntity implements User {
  declare readonly id: string;
  declare readonly mongoId: string | null;
  declare readonly isDefault: boolean;
  declare readonly clerkId: string | null;
  declare readonly handle: string;
  declare readonly firstName: string | null;
  declare readonly lastName: string | null;
  declare readonly email: string | null;
  declare readonly avatar: string | null;

  declare readonly isInvited: boolean;

  declare readonly appSource: User['appSource'];
  declare readonly stripeCustomerId: string | null;
  declare readonly isOnboardingCompleted: boolean;
  declare readonly onboardingStartedAt: Date | null;
  declare readonly onboardingCompletedAt: Date | null;
  declare readonly onboardingType: User['onboardingType'];
  declare readonly onboardingStepsCompleted: string[];

  declare readonly settings: Setting | null;
}
