import type { AgentStrategyFormState } from '@props/automation/agent-strategies-page.props';
import type { AgentStrategy } from '@services/automation/agent-strategies.service';
import type { Dispatch, SetStateAction } from 'react';

export interface AgentStrategyPublishTogglesProps {
  form: AgentStrategyFormState;
  publishPolicy?: AgentStrategy['publishPolicy'];
  setForm: Dispatch<SetStateAction<AgentStrategyFormState>>;
}
