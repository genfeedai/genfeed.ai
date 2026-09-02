import type { IBaseEntity, IBrand, IOrganization, IUser } from '../index';

export interface IFolder extends IBaseEntity {
  organization: IOrganization;
  brand?: IBrand;
  user: IUser;

  /**
   * Parent folder id for the Library tree. `null` / absent is a root folder.
   * Children inherit their parent's organization and brand scope.
   */
  parentId?: string | null;

  label: string;
  description?: string;
  tags: string[];

  isActive?: boolean;
}
