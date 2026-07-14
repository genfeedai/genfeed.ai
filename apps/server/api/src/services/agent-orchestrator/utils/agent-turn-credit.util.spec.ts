import {
  resolveAgentTurnCreditCost,
  settleAgentTurnCredits,
} from '@api/services/agent-orchestrator/utils/agent-turn-credit.util';
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

  it('does not create a zero-credit chat transaction after profile billing', async () => {
    const deductCreditsFromOrganization = vi.fn();

    const billed = await settleAgentTurnCredits({
      creditsUtilsService: { deductCreditsFromOrganization },
      model: 'openrouter/auto',
      organizationId: 'org-1',
      toolCalls: [
        {
          creditsUsed: 1,
          durationMs: 10,
          status: 'completed',
          toolName: AgentToolName.DRAFT_BRAND_VOICE_PROFILE,
        },
      ],
      turnCost: 1,
      userId: 'user-1',
    });

    expect(billed).toBe(0);
    expect(deductCreditsFromOrganization).not.toHaveBeenCalled();
  });
});
