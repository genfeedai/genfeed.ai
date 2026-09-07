import type { AgentStrategyFormState } from '@props/automation/agent-strategies-page.props';
import type { Dispatch, SetStateAction } from 'react';

export interface AgentStrategyBudgetFieldsProps {
  form: AgentStrategyFormState;
  setForm: Dispatch<SetStateAction<AgentStrategyFormState>>;
}
