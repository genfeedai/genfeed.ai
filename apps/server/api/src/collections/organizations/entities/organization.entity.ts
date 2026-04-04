import type { Organization } from '@api/collections/organizations/schemas/organization.schema';
import { BaseEntity } from '@api/shared/entities/base/base.entity';
import type { OrganizationCategory } from '@genfeedai/enums';
import { Types } from 'mongoose';

export class OrganizationEntity extends BaseEntity implements Organization {
  declare readonly user: Types.ObjectId;

  declare readonly label: string;

  declare readonly prefix?: string;

  declare readonly logo?: Types.ObjectId;
  declare readonly banner?: Types.ObjectId;
  declare readonly settings?: Types.ObjectId;
  declare readonly credits?: Types.ObjectId;
  declare readonly isSelected: boolean;
  declare readonly category: OrganizationCategory;
  declare readonly accountType?: OrganizationCategory;
  declare readonly onboardingCompleted: boolean;
}
