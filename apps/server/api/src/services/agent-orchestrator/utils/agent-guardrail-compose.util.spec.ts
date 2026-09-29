import { AGENT_JAILBREAK_HARDENING } from '@api/services/agent-orchestrator/constants/agent-jailbreak-hardening.constant';
import { AGENT_SCOPE_GUARDRAIL } from '@api/services/agent-orchestrator/constants/agent-scope-guardrail.constant';
import { composeAgentGuardrails } from '@api/services/agent-orchestrator/utils/agent-guardrail-compose.util';

describe('composeAgentGuardrails', () => {
  it('still returns both guardrails when the prompt is empty', () => {
    expect(composeAgentGuardrails('')).toBe(
      `${AGENT_SCOPE_GUARDRAIL}\n\n${AGENT_JAILBREAK_HARDENING}`,
    );
  });
});
