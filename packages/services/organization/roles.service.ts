import { API_ENDPOINTS } from '@genfeedai/contracts/constants';
import { Role } from '@genfeedai/models/auth/role.model';
import { BaseService } from '@services/core/base.service';

export class RolesService extends BaseService<Role> {
  constructor(token: string) {
    super(API_ENDPOINTS.ROLES, token, Role);
  }

  public static getInstance(token: string): RolesService {
    return BaseService.getDataServiceInstance(RolesService, token);
  }
}
