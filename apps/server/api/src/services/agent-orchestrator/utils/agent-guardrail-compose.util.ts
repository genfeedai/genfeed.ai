import { AGENT_JAILBREAK_HARDENING } from '@api/services/agent-orchestrator/constants/agent-jailbreak-hardening.constant';
import { AGENT_SCOPE_GUARDRAIL } from '@api/services/agent-orchestrator/constants/agent-scope-guardrail.constant';

/**
 * Appends prompt-stack guardrails after the resolved system prompt.
 * Order: `[prompt, AGENT_SCOPE_GUARDRAIL, AGENT_JAILBREAK_HARDENING]`.
 */
const AGENT_PROMPT_GUARDRAILS = [
  AGENT_SCOPE_GUARDRAIL,
  AGENT_JAILBREAK_HARDENING,
] as const;

export function composeAgentGuardrails(prompt: string): string {
  const missing = AGENT_PROMPT_GUARDRAILS.filter(
    (section) => !prompt.includes(section),
  );

  return [prompt, ...missing].filter(Boolean).join('\n\n');
}
