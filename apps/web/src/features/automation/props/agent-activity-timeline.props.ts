export type AgentActivityType = 'content' | 'report' | 'run';

export type AgentActivityFilter = 'all' | AgentActivityType;

export interface AgentActivityEntry {
  id: string;
  type: AgentActivityType;
  /** ISO timestamp; the merged feed sorts newest first on this field. */
  timestamp: string;
  title: string;
  description?: string;
  href?: string;
}
