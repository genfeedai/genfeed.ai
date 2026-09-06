import type { AgentFailureReason } from '../../enums/agent-failure-reason.enum';

export interface IAgentFailure {
  reason: AgentFailureReason;
  title: string;
  summary: string;
  detail: string | null;
  recovery: string | null;
  isConfigurationError: boolean;
  isRetryable: boolean;
}
