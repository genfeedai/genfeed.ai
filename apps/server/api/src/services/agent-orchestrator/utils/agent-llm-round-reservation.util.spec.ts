import { runReservedAgentLlmRound } from '@api/services/agent-orchestrator/utils/agent-llm-round-reservation.util';
import { calculateAgentExactCredits } from '@genfeedai/contracts/constants';

describe('runReservedAgentLlmRound', () => {
  it('holds the maximum and idempotently settles exact Auto cost', async () => {
    const credits = {
      releaseReservation: vi.fn().mockResolvedValue(undefined),
      reserveCredits: vi.fn().mockResolvedValue({ id: 'reservation-1' }),
      settleReservation: vi.fn(),
    };
    const response = {
      choices: [],
      id: 'gen-1',
      model: 'anthropic/claude-sonnet-5',
      usage: {
        completion_tokens: 20,
        cost: 0.012345,
        is_byok: false,
        prompt_tokens: 10,
        total_tokens: 30,
      },
    };

    const result = await runReservedAgentLlmRound({
      actorUserId: 'user-1',
      credits,
      estimatedCredits: vi.fn().mockResolvedValue(99),
      idempotencyKey: 'run-1:agent-llm-round:1',
      maximumCredits: 30,
      organizationId: 'org-1',
      requestedModel: 'openrouter/auto',
      run: vi.fn().mockResolvedValue(response),
      waived: false,
    });

    expect(credits.reserveCredits).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 30,
        idempotencyKey: 'run-1:agent-llm-round:1',
      }),
    );
    expect(credits.settleReservation).toHaveBeenCalledWith(
      expect.objectContaining({
        actualAmount: calculateAgentExactCredits(0.012345),
        reservationId: 'reservation-1',
      }),
    );
    expect(result.credits).toBe(calculateAgentExactCredits(0.012345));
  });

  it('releases the hold when the provider fails', async () => {
    const credits = {
      releaseReservation: vi.fn().mockResolvedValue(undefined),
      reserveCredits: vi.fn().mockResolvedValue({ id: 'reservation-1' }),
      settleReservation: vi.fn(),
    };

    await expect(
      runReservedAgentLlmRound({
        actorUserId: 'user-1',
        credits,
        estimatedCredits: vi.fn().mockResolvedValue(1),
        idempotencyKey: 'round-1',
        maximumCredits: 10,
        organizationId: 'org-1',
        requestedModel: 'openrouter/auto',
        run: vi.fn().mockRejectedValue(new Error('provider failed')),
        waived: false,
      }),
    ).rejects.toThrow('provider failed');
    expect(credits.releaseReservation).toHaveBeenCalledWith({
      organizationId: 'org-1',
      reservationId: 'reservation-1',
    });
  });
});
