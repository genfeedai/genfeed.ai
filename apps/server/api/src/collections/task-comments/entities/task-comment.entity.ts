import { BaseEntity } from '@api/shared/entities/base/base.entity';

export class TaskCommentEntity extends BaseEntity {
  declare readonly organizationId: string;
  declare readonly taskId: string;
  declare readonly authorUserId?: string;
  declare readonly authorAgentId?: string;
  declare readonly body: string;
}
