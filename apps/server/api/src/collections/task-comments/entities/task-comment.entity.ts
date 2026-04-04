import { BaseEntity } from '@api/shared/entities/base/base.entity';
import type { Types } from 'mongoose';

export class TaskCommentEntity extends BaseEntity {
  declare readonly organization: Types.ObjectId;
  declare readonly task: Types.ObjectId;
  declare readonly authorUserId?: string;
  declare readonly authorAgentId?: string;
  declare readonly body: string;
}
