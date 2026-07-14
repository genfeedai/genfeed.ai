import { resolveAgentTurnCreditCost } from '@api/services/agent-orchestrator/utils/agent-turn-credit.util';
import { AgentToolName } from '@genfeedai/interfaces';

describe('resolveAgentTurnCreditCost', () => {
  it('waives the chat turn after a successful one-credit profile build', () => {
    expect(
      resolveAgentTurnCreditCost(4, [
        {
          creditsUsed: 1,
          durationMs: 10,
          status: 'completed',
          toolName: AgentToolName.DRAFT_BRAND_VOICE_PROFILE,
        },
      ]),
    ).toBe(0);
  });

  it('keeps the chat turn cost when profile generation fails', () => {
    expect(
      resolveAgentTurnCreditCost(4, [
        {
          creditsUsed: 0,
          durationMs: 10,
          status: 'failed',
          toolName: AgentToolName.DRAFT_BRAND_VOICE_PROFILE,
        },
      ]),
    ).toBe(4);
  });
});
