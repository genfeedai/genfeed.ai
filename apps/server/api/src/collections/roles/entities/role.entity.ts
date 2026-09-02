import { BaseEntity } from '@api/entities/base.entity';
import { type Role } from '@genfeedai/prisma';

export class RoleEntity extends BaseEntity implements Role {
  declare readonly label: string;
  declare readonly key: string;
  declare readonly primaryColor: string | null;
}
