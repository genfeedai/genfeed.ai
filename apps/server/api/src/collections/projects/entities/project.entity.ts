import { BaseEntity } from '@server/entities/base.entity';

export class ProjectEntity extends BaseEntity {
  declare readonly organizationId: string;
  declare readonly label: string;
  declare readonly description?: string;
  declare readonly status: string;
}
