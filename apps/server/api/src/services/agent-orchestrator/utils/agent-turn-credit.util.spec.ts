import {
  describeBilledModels,
  resolveAgentRoundCreditCost,
  resolveAgentTurnCreditCost,
  settleAgentTurnCredits,
} from '@api/services/agent-orchestrator/utils/agent-turn-credit.util';
import { getAgentChatModelRoundCredits } from '@genfeedai/constants';
import { AgentToolName } from '@genfeedai/interfaces';

const CHEAP_MODEL = 'deepseek/deepseek-v4-flash-0731';
const EXPENSIVE_MODEL = 'anthropic/claude-opus-5';

describe('resolveAgentRoundCreditCost', () => {
  it('prices the round against the model that actually answered', () => {
    expect(
      resolveAgentRoundCreditCost({
        actualModel: EXPENSIVE_MODEL,
        turnCost: 1,
      }),
    ).toBe(getAgentChatModelRoundCredits(EXPENSIVE_MODEL));
  });

  it('charges more when the router substitutes a pricier model', () => {
    const cheap = resolveAgentRoundCreditCost({
      actualModel: CHEAP_MODEL,
      turnCost: 1,
    });
    const substituted = resolveAgentRoundCreditCost({
      actualModel: EXPENSIVE_MODEL,
      turnCost: 1,
    });

    expect(substituted).toBeGreaterThan(cheap);
  });

  it('prices a retired key at its catalogue successor', () => {
    expect(
      resolveAgentRoundCreditCost({
        actualModel: 'anthropic/claude-opus-5',
        turnCost: 1,
      }),
    ).toBe(getAgentChatModelRoundCredits(EXPENSIVE_MODEL));
  });

  it('keeps every round free inside a waived turn', () => {
    expect(
      resolveAgentRoundCreditCost({
        actualModel: EXPENSIVE_MODEL,
        turnCost: 0,
      }),
    ).toBe(0);
  });
});

describe('describeBilledModels', () => {
  it('names every model that served a round', () => {
    expect(
      describeBilledModels(CHEAP_MODEL, [CHEAP_MODEL, EXPENSIVE_MODEL]),
    ).toBe(`${CHEAP_MODEL}, ${EXPENSIVE_MODEL}`);
  });

  it('falls back to the requested model when nothing answered', () => {
    expect(describeBilledModels(CHEAP_MODEL, [])).toBe(CHEAP_MODEL);
  });
});

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

describe('settleAgentTurnCredits', () => {
  it('bills the accumulated rounds against the models that answered', async () => {
    const deductCreditsFromOrganization = vi.fn();

    const billed = await settleAgentTurnCredits({
      actualModels: [CHEAP_MODEL, EXPENSIVE_MODEL],
      creditsUtilsService: { deductCreditsFromOrganization },
      model: CHEAP_MODEL,
      organizationId: 'org-1',
      roundCredits: 12,
      toolCalls: [],
      userId: 'user-1',
    });

    expect(billed).toBe(12);
    expect(deductCreditsFromOrganization).toHaveBeenCalledWith(
      'org-1',
      'user-1',
      12,
      `Agent chat turn (${CHEAP_MODEL}, ${EXPENSIVE_MODEL})`,
      expect.anything(),
    );
  });

  it('does not create a zero-credit chat transaction after profile billing', async () => {
    const deductCreditsFromOrganization = vi.fn();

    const billed = await settleAgentTurnCredits({
      actualModels: [CHEAP_MODEL],
      creditsUtilsService: { deductCreditsFromOrganization },
      model: CHEAP_MODEL,
      organizationId: 'org-1',
      roundCredits: 1,
      toolCalls: [
        {
          creditsUsed: 1,
          durationMs: 10,
          status: 'completed',
          toolName: AgentToolName.DRAFT_BRAND_VOICE_PROFILE,
        },
      ],
      userId: 'user-1',
    });

    expect(billed).toBe(0);
    expect(deductCreditsFromOrganization).not.toHaveBeenCalled();
  });
});
