import type { IBaseEntity, IBrand, IOrganization, IUser } from '../index';
export interface IFolder extends IBaseEntity {
    organization: IOrganization;
    brand?: IBrand;
    user: IUser;
    label: string;
    description?: string;
    tags: string[];
    isActive?: boolean;
}
//# sourceMappingURL=folder.interface.d.ts.map