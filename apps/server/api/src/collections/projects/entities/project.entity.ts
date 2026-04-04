import { BaseEntity } from '@api/shared/entities/base/base.entity';
import type { Types } from 'mongoose';

export class ProjectEntity extends BaseEntity {
  declare readonly organization: Types.ObjectId;
  declare readonly label: string;
  declare readonly description?: string;
  declare readonly status: string;
}
