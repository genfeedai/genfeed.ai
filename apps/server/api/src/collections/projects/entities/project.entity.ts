import { BaseEntity } from '@api/shared/entities/base/base.entity';

export class ProjectEntity extends BaseEntity {
  declare readonly organization: string;
  declare readonly label: string;
  declare readonly description?: string;
  declare readonly status: string;
}
