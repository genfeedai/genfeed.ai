import { Role } from '@api/collections/roles/schemas/role.schema';
import { BaseEntity } from '@api/shared/entities/base/base.entity';

export class RoleEntity extends BaseEntity implements Role {
  declare readonly label: string;
  declare readonly key: string;
  declare readonly primaryColor?: string;
}
