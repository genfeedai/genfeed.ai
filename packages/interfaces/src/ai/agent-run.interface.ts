import type {
  AgentExecutionStatus,
  AgentExecutionTrigger,
} from '@genfeedai/enums';
import type { AgentArtifactReference } from './agent-artifact-reference.interface';

export interface IAgentRunToolCall {
  toolName: string;
  status: 'completed' | 'failed';
  creditsUsed: number;
  durationMs: number;
  error?: string;
  executedAt: string;
}

export interface IAgentRunStep {
  id?: string;
  index: number;
  label: string;
  status: AgentExecutionStatus;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  toolCallIds?: string[];
  metadata?: Record<string, unknown>;
}

export interface IAgentRun {
  id: string;
  artifactReferences?: AgentArtifactReference[];
  artifactVersionPinIds?: string[];
  organization: string;
  user: string;
  brand?: string | null;
  trigger: AgentExecutionTrigger;
  status: AgentExecutionStatus;
  strategy?: string;
  /** @deprecated Agent runs are persisted and serialized against `thread`. */
  conversation?: string;
  thread?: string;
  parentRun?: string;
  label: string;
  objective?: string;
  steps: IAgentRunStep[];
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
