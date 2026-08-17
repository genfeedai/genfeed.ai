import { AGENT_SCOPE_GUARDRAIL } from '@api/services/agent-orchestrator/constants/agent-scope-guardrail.constant';

export function composeAgentGuardrails(prompt: string): string {
  return [prompt, AGENT_SCOPE_GUARDRAIL].filter(Boolean).join('\n\n');
}
