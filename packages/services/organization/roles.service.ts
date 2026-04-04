import { RoleSerializer } from '@genfeedai/client/serializers';
import { API_ENDPOINTS } from '@genfeedai/constants';
import { Role } from '@models/auth/role.model';
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
