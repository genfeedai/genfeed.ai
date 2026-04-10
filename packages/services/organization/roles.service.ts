import { API_ENDPOINTS } from '@genfeedai/constants';
import { Role } from '@genfeedai/models/auth/role.model';
import { RoleSerializer } from '@genfeedai/serializers';
import { BaseService } from '@services/core/base.service';

export class RolesService extends BaseService<Role> {
  constructor(token: string) {
    super(API_ENDPOINTS.ROLES, token, Role, RoleSerializer);
  }

  public static getInstance(token: string): RolesService {
    return BaseService.getDataServiceInstance(
      RolesService,
      token,
    ) as RolesService;
  }
}
