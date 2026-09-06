import type {
  AgentStrategy,
  AgentStrategyWorkflowBinding,
  RunAgentStrategyWorkflowInput,
} from '@services/automation/agent-strategies.service';

export interface AgentWorkflowRunDialogProps {
  binding: AgentStrategyWorkflowBinding | null;
  isLoadingBinding: boolean;
  isOpen: boolean;
  isSubmitting: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: RunAgentStrategyWorkflowInput) => Promise<void>;
  strategy: AgentStrategy | null;
}
