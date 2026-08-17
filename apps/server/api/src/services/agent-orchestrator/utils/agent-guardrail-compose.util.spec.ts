import { AGENT_JAILBREAK_HARDENING } from '@api/services/agent-orchestrator/constants/agent-jailbreak-hardening.constant';
import { AGENT_SCOPE_GUARDRAIL } from '@api/services/agent-orchestrator/constants/agent-scope-guardrail.constant';
import { composeAgentGuardrails } from '@api/services/agent-orchestrator/utils/agent-guardrail-compose.util';

describe('composeAgentGuardrails', () => {
  it('appends scope then jailbreak after the resolved prompt', () => {
    expect(composeAgentGuardrails('base prompt')).toBe(
      `base prompt\n\n${AGENT_SCOPE_GUARDRAIL}\n\n${AGENT_JAILBREAK_HARDENING}`,
    );
  });

  it('keeps an already-hardened prompt unchanged', () => {
    const hardened = composeAgentGuardrails('base prompt');

    expect(composeAgentGuardrails(hardened)).toBe(hardened);
  });

  it('still returns both guardrails when the prompt is empty', () => {
    expect(composeAgentGuardrails('')).toBe(
      `${AGENT_SCOPE_GUARDRAIL}\n\n${AGENT_JAILBREAK_HARDENING}`,
    );
  });
});
