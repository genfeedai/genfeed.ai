import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type {
  IBrand,
  IFolder,
  IOrganization,
  IUser,
} from '@genfeedai/contracts/interfaces';

export class Folder extends BaseEntity implements IFolder {
  declare public organization: IOrganization;
  declare public brand?: IBrand;
  declare public user: IUser;
  declare public label: string;
  declare public description?: string;
  declare public tags: string[];
  declare public isActive?: boolean;

  constructor(data: Partial<IFolder> = {}) {
    super(data);
  }
}
