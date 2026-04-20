export type { AgentGoal as AgentGoalDocument } from '@genfeedai/prisma';

export const AGENT_GOAL_METRICS = [
  'engagement_rate',
  'posts',
  'views',
] as const;

export type AgentGoalMetric = (typeof AGENT_GOAL_METRICS)[number];
