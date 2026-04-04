import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type {
  IBrand,
  IFolder,
  IOrganization,
  IUser,
} from '@genfeedai/interfaces';

export class Folder extends BaseEntity implements IFolder {
  public declare organization: IOrganization;
  public declare brand?: IBrand;
  public declare user: IUser;
  public declare label: string;
  public declare description?: string;
  public declare tags: string[];
  public declare isActive?: boolean;

  constructor(data: Partial<IFolder> = {}) {
    super(data);
  }
}
