import type {
  AgentExecutionStatus,
  AgentExecutionTrigger,
} from '@genfeedai/enums';

export interface IAgentRunToolCall {
  toolName: string;
  status: 'completed' | 'failed';
  creditsUsed: number;
  durationMs: number;
  error?: string;
  executedAt: string;
}

export interface IAgentRun {
  id: string;
  organization: string;
  user: string;
  trigger: AgentExecutionTrigger;
  status: AgentExecutionStatus;
  strategy?: string;
  conversation?: string;
  parentRun?: string;
  label: string;
  objective?: string;
  toolCalls: IAgentRunToolCall[];
  summary?: string;
  creditsUsed: number;
  creditBudget?: number;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  error?: string;
  retryCount: number;
  progress: number;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface IAgentRunStats {
  totalRuns: number;
  activeRuns: number;
  completedToday: number;
  failedToday: number;
  totalCreditsToday: number;
}

export interface IAgentRunContentItem {
  id: string;
  category?: string;
  status: string;
  label?: string;
  description?: string;
  cdnUrl?: string;
  createdAt: string;
  type: 'post' | 'ingredient';
}

export interface IAgentRunContent {
  posts: IAgentRunContentItem[];
  ingredients: IAgentRunContentItem[];
}
