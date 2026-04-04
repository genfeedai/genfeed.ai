import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type { AssetScope, OrganizationCategory } from '@genfeedai/enums';
import type {
  IAsset,
  IBrand,
  ICredit,
  IOrganization,
  IOrganizationSetting,
  IUser,
} from '@genfeedai/interfaces';

export class Organization extends BaseEntity implements IOrganization {
  public declare label: string;
  public declare user: IUser;
  public declare settings: IOrganizationSetting;
  public declare credits?: ICredit;
  public declare slug: string;
  public declare description?: string;
  public declare website?: string;
  public declare logo?: IAsset;
  public declare banner?: IAsset;
  public declare isActive?: boolean;
  public declare isVerified?: boolean;
  public declare scope?: AssetScope;
  public declare owner?: IUser;
  public declare members?: IUser[];
  public declare brands?: IBrand[];
  public declare memberCount?: number;
  public declare brandCount?: number;
  public declare isSelected: boolean;
  public declare category?: OrganizationCategory;
  public declare accountType?: OrganizationCategory;

  constructor(data: Partial<IOrganization> = {}) {
    super(data);
  }
}
