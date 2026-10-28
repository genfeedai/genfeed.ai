export type AgentTaskStatus =
  | 'pending'
  | 'active'
  | 'completed'
  | 'failed'
  | 'cancelled';

/** One named phase of a multi-step build, as the agent reports it. */
export interface AgentTask {
  detail?: string;
  id: string;
  label: string;
  status: AgentTaskStatus;
}
