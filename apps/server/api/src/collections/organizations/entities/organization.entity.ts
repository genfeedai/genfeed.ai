import type { Organization } from '@api/collections/organizations/schemas/organization.schema';
import { BaseEntity } from '@api/shared/entities/base/base.entity';
import type { OrganizationCategory } from '@genfeedai/enums';

export class OrganizationEntity extends BaseEntity implements Organization {
  declare readonly user: string;

  declare readonly label: string;

  declare readonly prefix?: string;

  declare readonly logo?: string;
  declare readonly banner?: string;
  declare readonly settings?: string;
  declare readonly credits?: string;
  declare readonly isSelected: boolean;
  declare readonly category: OrganizationCategory;
  declare readonly accountType?: OrganizationCategory;
  declare readonly onboardingCompleted: boolean;
}
