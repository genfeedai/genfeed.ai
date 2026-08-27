import { AgentType } from '@genfeedai/enums';

export const ORCHESTRATOR_AGENT_TYPE = 'orchestrator' as AgentType;

export const AGENT_TYPE_VALUES = [
  ...Object.values(AgentType),
  ORCHESTRATOR_AGENT_TYPE,
] as AgentType[];

export function isOrchestratorAgentType(
  agentType?: AgentType | string | null,
): boolean {
  return agentType === ORCHESTRATOR_AGENT_TYPE;
}
