import {
  describeBilledModels,
  resolveAgentNextRoundCreditRequirement,
  resolveAgentRoundCreditCost,
  resolveAgentTurnCreditCost,
  settleAgentTurnCredits,
} from '@api/services/agent-orchestrator/utils/agent-turn-credit.util';
import { AgentToolName } from '@genfeedai/interfaces';

const CHEAP_MODEL = 'deepseek/deepseek-v4-flash-0731';
const EXPENSIVE_MODEL = 'anthropic/claude-opus-5';

describe('resolveAgentRoundCreditCost', () => {
  it('prices the round against the model that actually answered', () => {
    expect(
      resolveAgentRoundCreditCost({
        actualModel: EXPENSIVE_MODEL,
        roundCreditsForModel: 12,
        turnCost: 1,
      }),
    ).toBe(12);
  });

  it('charges more when the router substitutes a pricier model', () => {
    const cheap = resolveAgentRoundCreditCost({
      actualModel: CHEAP_MODEL,
      roundCreditsForModel: 2,
      turnCost: 1,
    });
    const substituted = resolveAgentRoundCreditCost({
      actualModel: EXPENSIVE_MODEL,
      roundCreditsForModel: 12,
      turnCost: 1,
    });

    expect(substituted).toBeGreaterThan(cheap);
  });

  it('keeps every round free inside a waived turn', () => {
    expect(
      resolveAgentRoundCreditCost({
        actualModel: EXPENSIVE_MODEL,
        roundCreditsForModel: 12,
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

describe('resolveAgentNextRoundCreditRequirement', () => {
  it('requires the accumulated bill plus the requested-model estimate', () => {
    expect(
      resolveAgentNextRoundCreditRequirement({
        nextRoundCredits: 3,
        roundCredits: 7,
        toolCalls: [],
      }),
    ).toBe(10);
  });

  it('keeps later rounds free after the profile-build waiver completes', () => {
    expect(
      resolveAgentNextRoundCreditRequirement({
        nextRoundCredits: 3,
        roundCredits: 7,
        toolCalls: [
          {
            creditsUsed: 1,
            durationMs: 10,
            status: 'completed',
            toolName: AgentToolName.DRAFT_BRAND_VOICE_PROFILE,
          },
        ],
      }),
    ).toBe(0);
  });
});

describe('settleAgentTurnCredits', () => {
  it('bills the accumulated rounds against the models that answered', async () => {
    const deductCreditsFromOrganization = vi.fn();
    const getOrganizationCreditsBalance = vi.fn().mockResolvedValue(50);

    const billed = await settleAgentTurnCredits({
      actualModels: [CHEAP_MODEL, EXPENSIVE_MODEL],
      creditsUtilsService: {
        deductCreditsFromOrganization,
        getOrganizationCreditsBalance,
      },
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
    expect(getOrganizationCreditsBalance).toHaveBeenCalledWith('org-1');
  });

  it('permits only the actual-model shortfall after the provider responds', async () => {
    const deductCreditsFromOrganization = vi.fn();
    const getOrganizationCreditsBalance = vi.fn().mockResolvedValue(4);

    const billed = await settleAgentTurnCredits({
      actualModels: [EXPENSIVE_MODEL],
      creditsUtilsService: {
        deductCreditsFromOrganization,
        getOrganizationCreditsBalance,
      },
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
      `Agent chat turn (${EXPENSIVE_MODEL})`,
      expect.anything(),
      { maxOverdraftCredits: 8 },
    );
  });

  it('does not create a zero-credit chat transaction after profile billing', async () => {
    const deductCreditsFromOrganization = vi.fn();
    const getOrganizationCreditsBalance = vi.fn();

    const billed = await settleAgentTurnCredits({
      actualModels: [CHEAP_MODEL],
      creditsUtilsService: {
        deductCreditsFromOrganization,
        getOrganizationCreditsBalance,
      },
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
    expect(getOrganizationCreditsBalance).not.toHaveBeenCalled();
  });
});
