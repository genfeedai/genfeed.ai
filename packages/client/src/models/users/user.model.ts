import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type { OnboardingType, PlatformRole } from '@genfeedai/contracts';
import type {
  IBrand,
  IOrganization,
  ISetting,
  IUser,
} from '@genfeedai/contracts/interfaces';

export class User extends BaseEntity implements IUser {
  declare public organization?: IOrganization;
  declare public brands?: IBrand[];
  declare public email: string;
  declare public platformRole?: PlatformRole;
  declare public firstName: string;
  declare public lastName: string;
  declare public username?: string;
  declare public avatar?: string;
  declare public isActive?: boolean;
  declare public isVerified?: boolean;
  declare public emailVerified?: boolean;
  declare public timezone?: string;
  declare public language?: string;
  declare public theme?: string;
  declare public handle: string;
  declare public settings: ISetting;
  declare public isOnboardingCompleted?: boolean;
  declare public onboardingStartedAt?: Date;
  declare public onboardingCompletedAt?: Date;
  declare public onboardingType?: OnboardingType;
  declare public onboardingStepsCompleted?: string[];

  constructor(data: Partial<IUser> = {}) {
    super(data);
  }
}
