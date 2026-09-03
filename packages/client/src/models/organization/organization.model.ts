import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type { AssetScope, OrganizationCategory } from '@genfeedai/contracts';
import type {
  IAsset,
  IBrand,
  ICredit,
  IOrganization,
  IOrganizationSetting,
  IUser,
} from '@genfeedai/contracts/interfaces';

export class Organization extends BaseEntity implements IOrganization {
  declare public label: string;
  declare public user: IUser;
  declare public settings: IOrganizationSetting;
  declare public credits?: ICredit;
  declare public slug: string;
  declare public description?: string;
  declare public website?: string;
  declare public logo?: IAsset;
  declare public banner?: IAsset;
  declare public isActive?: boolean;
  declare public isVerified?: boolean;
  declare public scope?: AssetScope;
  declare public owner?: IUser;
  declare public members?: IUser[];
  declare public brands?: IBrand[];
  declare public memberCount?: number;
  declare public brandCount?: number;
  declare public isSelected: boolean;
  declare public category?: OrganizationCategory;
  declare public accountType?: OrganizationCategory;

  constructor(data: Partial<IOrganization> = {}) {
    super(data);
  }
}
