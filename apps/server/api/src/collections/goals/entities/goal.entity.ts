import type {
  GoalLevel,
  GoalStatus,
} from '@api/collections/goals/schemas/goal.schema';

export class GoalEntity {
  readonly id!: string;
  readonly organizationId!: string;
  readonly title!: string;
  readonly description?: string;
  readonly status!: GoalStatus;
  readonly level!: GoalLevel;
  readonly parentId?: string;
  readonly isDeleted!: boolean;
  readonly createdAt!: Date;
  readonly updatedAt!: Date;
}
