import type { AgentType } from '@genfeedai/contracts';

export type Props = {
  selectedAgentType: AgentType;
  onSelectType: (type: AgentType) => void;
  onNext: () => void;
};
