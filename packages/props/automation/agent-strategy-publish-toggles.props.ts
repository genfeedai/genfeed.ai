import type { AgentStrategyFormState } from '@props/automation/agent-strategies-page.props';
import type { Dispatch, SetStateAction } from 'react';

export interface AgentStrategyPublishTogglesProps {
  form: AgentStrategyFormState;
  setForm: Dispatch<SetStateAction<AgentStrategyFormState>>;
}
