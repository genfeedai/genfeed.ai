import type { AgentInputRequest } from '@genfeedai/agent/models/agent-chat.model';

export interface AgentInputRequestOverlayProps {
  isSubmitting?: boolean;
  onSubmit: (answer: string, optionIds?: string[]) => void | Promise<void>;
  request: AgentInputRequest;
  variant?: 'composer' | 'inline' | 'overlay';
}
