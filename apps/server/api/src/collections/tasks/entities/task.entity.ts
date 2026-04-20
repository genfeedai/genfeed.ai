import type { TaskLinkedEntityModel } from '@api/collections/tasks/schemas/task.schema';
import { BaseEntity } from '@api/shared/entities/base/base.entity';

export class TaskEntity extends BaseEntity {
  declare readonly organization: string;
  declare readonly brand?: string;
  declare readonly taskNumber: number;
  declare readonly identifier: string;
  declare readonly title: string;
  declare readonly description?: string;
  declare readonly status: string;
  declare readonly priority: string;
  declare readonly parentId?: string;
  declare readonly projectId?: string;
  declare readonly goalId?: string;
  declare readonly assigneeUserId?: string;
  declare readonly assigneeAgentId?: string;
  declare readonly checkoutRunId?: string;
  declare readonly checkoutAgentId?: string;
  declare readonly checkedOutAt?: Date;
  declare readonly linkedEntities: Array<{
    entityId: string;
    entityModel: TaskLinkedEntityModel;
  }>;
}
