import type { TaskLinkedEntityModel } from '@api/collections/tasks/schemas/task.schema';
import { BaseEntity } from '@api/shared/entities/base/base.entity';
import type { Types } from 'mongoose';

export class TaskEntity extends BaseEntity {
  declare readonly organization: Types.ObjectId;
  declare readonly brand?: Types.ObjectId;
  declare readonly taskNumber: number;
  declare readonly identifier: string;
  declare readonly title: string;
  declare readonly description?: string;
  declare readonly status: string;
  declare readonly priority: string;
  declare readonly parentId?: Types.ObjectId;
  declare readonly projectId?: string;
  declare readonly goalId?: string;
  declare readonly assigneeUserId?: string;
  declare readonly assigneeAgentId?: string;
  declare readonly checkoutRunId?: string;
  declare readonly checkoutAgentId?: string;
  declare readonly checkedOutAt?: Date;
  declare readonly linkedEntities: Array<{
    entityId: Types.ObjectId;
    entityModel: TaskLinkedEntityModel;
  }>;
}
