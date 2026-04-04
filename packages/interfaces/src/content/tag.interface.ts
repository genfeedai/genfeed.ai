import type { TagCategory } from '@genfeedai/enums';
import type { IBaseEntity, IBrand, IOrganization, IUser } from '../index';

export interface ITag extends IBaseEntity {
  user: IUser;
  organization: IOrganization;
  brand: IBrand;

  category: TagCategory;

  label: string;
  description?: string;
  key?: string;

  backgroundColor: string;
  textColor: string;
  isActive?: boolean;
}
