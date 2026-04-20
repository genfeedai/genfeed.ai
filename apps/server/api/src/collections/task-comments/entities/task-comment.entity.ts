import { BaseEntity } from '@api/shared/entities/base/base.entity';

export class TaskCommentEntity extends BaseEntity {
  declare readonly organization: string;
  declare readonly task: string;
  declare readonly authorUserId?: string;
  declare readonly authorAgentId?: string;
  declare readonly body: string;
}
