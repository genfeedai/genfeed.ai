import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type {
  IBrand,
  IOrganization,
  ISetting,
  IUser,
} from '@genfeedai/interfaces';

export class User extends BaseEntity implements IUser {
  public declare organization?: IOrganization;
  public declare brands?: IBrand[];
  public declare email: string;
  public declare firstName: string;
  public declare lastName: string;
  public declare username?: string;
  public declare avatar?: string;
  public declare isActive?: boolean;
  public declare isVerified?: boolean;
  public declare emailVerified?: boolean;
  public declare timezone?: string;
  public declare language?: string;
  public declare theme?: string;
  public declare clerkId: string;
  public declare handle: string;
  public declare settings: ISetting;
  public declare isOnboardingCompleted?: boolean;
  public declare onboardingStartedAt?: Date;
  public declare onboardingCompletedAt?: Date;
  public declare onboardingType?: 'creator' | 'organization';
  public declare onboardingStepsCompleted?: string[];

  constructor(data: Partial<IUser> = {}) {
    super(data);
  }
}
