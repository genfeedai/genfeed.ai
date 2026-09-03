import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type { TagCategory } from '@genfeedai/contracts';
import type {
  IBrand,
  IOrganization,
  ITag,
  IUser,
} from '@genfeedai/contracts/interfaces';

export class Tag extends BaseEntity implements ITag {
  declare public brand: IBrand;
  declare public user: IUser;
  declare public organization: IOrganization;
  declare public category: TagCategory;
  declare public label: string;
  declare public description?: string;
  declare public key?: string;
  declare public backgroundColor: string;
  declare public textColor: string;
  declare public isActive?: boolean;
  declare public color?: string;

  constructor(data: Partial<ITag> = {}) {
    super(data);
  }
}
