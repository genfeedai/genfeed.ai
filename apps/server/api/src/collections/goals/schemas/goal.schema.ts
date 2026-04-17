export type {
  Goal,
  Goal as GoalDocument,
} from '@genfeedai/prisma';

export const GOAL_STATUSES = ['active', 'completed', 'archived'] as const;
export const GOAL_LEVELS = ['company', 'team', 'individual'] as const;

export type GoalStatus = (typeof GOAL_STATUSES)[number];
export type GoalLevel = (typeof GOAL_LEVELS)[number];
