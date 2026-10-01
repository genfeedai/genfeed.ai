import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createProactiveProductionTurnFixture,
  PRODUCTION_TURN_COST_USD,
  PRODUCTION_TURN_DECOY,
  PRODUCTION_TURN_FOREIGN_MEMORY,
  PRODUCTION_TURN_MEMORY,
  PRODUCTION_TURN_TEXT,
  PRODUCTION_TURN_VOICE,
} from './proactive-agent-production-turn.fixture';

type Fixture = Awaited<ReturnType<typeof createProactiveProductionTurnFixture>>;

// Actual Nest lifecycle + Bull callback + production turn/context/financial
// services. Only the external inference response is scripted. The dedicated
// migrated database belongs exclusively to this focused run and is discarded
// afterward; it must not be shared with the full E2E suite.
describe('proactive production turn acceptance', () => {
  let fixture: Fixture;
  beforeAll(async () => {
    fixture = await createProactiveProductionTurnFixture();
  }, 45_000);
  afterAll(async () => {
    await fixture?.close();
  }, 15_000);

  it('runs a paid text turn through the real worker and settles its actual reservation once', async () => {
    const actor = await fixture.seedActor('text');
    const before = await fixture.credits.getOrganizationCreditsBalance(
      actor.organizationId,
    );
    const { execution, outcome } = await fixture.run(actor);
    expect(outcome.error).toBeNull();
    expect(execution.status).toBe('COMPLETED');
    expect(fixture.calls.processor).toHaveBeenCalledTimes(1);
    expect(fixture.calls.liveProcessor).not.toHaveBeenCalled();
    expect(fixture.calls.prepare).toHaveBeenCalledTimes(1);
    expect(fixture.calls.execute).toHaveBeenCalledTimes(1);
    expect(fixture.calls.context).toHaveBeenCalledTimes(1);
    expect(fixture.calls.stream).toHaveBeenCalledTimes(1);
    expect(fixture.calls.reserve).toHaveBeenCalledTimes(1);
    expect(fixture.calls.settle).toHaveBeenCalledTimes(1);
    expect(fixture.calls.release).not.toHaveBeenCalled();
    expect(fixture.observed).toHaveLength(1);
    const providerInput = JSON.stringify(fixture.observed[0].messages);
    expect(providerInput).toContain(PRODUCTION_TURN_MEMORY);
    expect(providerInput).toContain(PRODUCTION_TURN_VOICE);
    expect(providerInput).not.toContain(PRODUCTION_TURN_DECOY);
    expect(providerInput).not.toContain(PRODUCTION_TURN_FOREIGN_MEMORY);
    const reservations = await fixture.prisma.creditReservation.findMany({
      where: {
        organizationId: actor.organizationId,
        isDeleted: false,
        workloadType: 'agent-llm-round',
      },
    });
    expect(reservations).toHaveLength(1);
    expect(fixture.heldReservationIds).toEqual([reservations[0].id]);
    const reservation = reservations[0];
    const cost = fixture.registry.toRoundCredits(PRODUCTION_TURN_COST_USD);
    expect(cost).toBeGreaterThan(0);
    expect(reservation).toMatchObject({
      actorUserId: actor.userId,
      status: 'SETTLED',
      idempotencyKey: `${execution.id}:agent-llm-round:1`,
      workloadId: `${execution.id}:agent-llm-round:1`,
      settledAmount: cost,
    });
    const debits = await fixture.prisma.creditTransaction.findMany({
      where: {
        organizationId: actor.organizationId,
        isDeleted: false,
        amount: { lt: 0 },
      },
    });
    expect(debits).toHaveLength(1);
    expect(debits[0]).toMatchObject({
      actorUserId: actor.userId,
      reservationId: reservation.id,
      amount: -cost,
    });
    expect(
      await fixture.credits.getOrganizationCreditsBalance(actor.organizationId),
    ).toBeCloseTo(before - cost, 6);
    const thread = await fixture.prisma.agentThread.findFirstOrThrow({
      where: {
        organizationId: actor.organizationId,
        isDeleted: false,
        agentStrategyId: actor.strategyId,
      },
    });
    const messages = await fixture.prisma.agentMessage.findMany({
      where: {
        organizationId: actor.organizationId,
        isDeleted: false,
        threadId: thread.id,
      },
    });
    expect(
      messages.some(
        (message) =>
          message.role === 'assistant' &&
          message.content?.includes(PRODUCTION_TURN_TEXT),
      ),
    ).toBe(true);
    const snapshots = await fixture.prisma.agentThreadSnapshot.findMany({
      where: {
        organizationId: actor.organizationId,
        threadId: thread.id,
        isDeleted: false,
      },
    });
    expect(JSON.stringify(snapshots)).toContain(execution.id);
    const events = await fixture.prisma.agentThreadEvent.count({
      where: {
        organizationId: actor.organizationId,
        threadId: thread.id,
        isDeleted: false,
      },
    });
    expect(events).toBeGreaterThan(0);
    // This is an acceptance assertion, not an assumed fixture-side attribution.
    // A missing link exposes real proactive accounting as a production defect.
    expect(
      reservation.workflowExecutionId,
      'Actual round reservation must retain workflow attribution',
    ).toBe(execution.id);
    expect(
      debits[0].workflowExecutionId,
      'Actual debit must retain workflow attribution',
    ).toBe(execution.id);
    const strategy = await fixture.prisma.agentStrategy.findFirstOrThrow({
      where: {
        id: actor.strategyId,
        organizationId: actor.organizationId,
        isDeleted: false,
      },
    });
    expect(strategy.config).toMatchObject({
      creditsUsedToday: cost,
      creditsUsedThisWeek: cost,
      runHistory: [
        expect.objectContaining({
          executionId: execution.id,
          creditsUsed: cost,
        }),
      ],
    });
    const reports = await fixture.prisma.agentStrategyReport.findMany({
      where: {
        strategyId: actor.strategyId,
        organizationId: actor.organizationId,
        isDeleted: false,
      },
    });
    expect(reports).toHaveLength(1);
    expect(reports[0].data).toMatchObject({
      creditsSpent: cost,
      metadata: { executionId: execution.id },
    });
    fixture.assertTransports();
  }, 40_000);

  it('releases the real financial hold when the external inference call fails', async () => {
    const actor = await fixture.seedActor('provider-failure');
    const before = await fixture.credits.getOrganizationCreditsBalance(
      actor.organizationId,
    );
    const { execution, outcome } = await fixture.run(actor);
    expect(outcome.error).toContain('4959 scripted provider failure');
    expect(execution.status).toBe('FAILED');
    expect(fixture.calls.prepare).toHaveBeenCalled();
    expect(fixture.calls.execute).toHaveBeenCalled();
    expect(fixture.calls.context).toHaveBeenCalled();
    expect(fixture.calls.stream).toHaveBeenCalled();
    expect(fixture.calls.reserve).toHaveBeenCalledTimes(1);
    expect(fixture.calls.release).toHaveBeenCalledTimes(1);
    expect(fixture.calls.settle).not.toHaveBeenCalled();
    expect(fixture.observed).toHaveLength(1);
    const reservations = await fixture.prisma.creditReservation.findMany({
      where: {
        organizationId: actor.organizationId,
        isDeleted: false,
        workloadType: 'agent-llm-round',
      },
    });
    expect(reservations).toHaveLength(1);
    expect(reservations[0]).toMatchObject({
      status: 'RELEASED',
      idempotencyKey: `${execution.id}:agent-llm-round:1`,
      actorUserId: actor.userId,
    });
    expect(
      await fixture.prisma.creditTransaction.count({
        where: {
          organizationId: actor.organizationId,
          isDeleted: false,
          amount: { lt: 0 },
        },
      }),
    ).toBe(0);
    expect(
      await fixture.credits.getOrganizationCreditsBalance(actor.organizationId),
    ).toBe(before);
    fixture.assertTransports();
  }, 40_000);

  it('requires the real authorizer to produce a strategy-attributed draft without fabricated confirmation', async () => {
    const actor = await fixture.seedActor('draft');
    const { execution, outcome } = await fixture.run(actor);
    expect(outcome.error).toBeNull();
    expect(execution.status).toBe('COMPLETED');
    expect(fixture.calls.tools).toHaveBeenCalled();
    expect(fixture.calls.authorize).toHaveBeenCalled();
    const authorization = fixture.calls.authorize.mock.calls.find(
      (call) => call[0] === 'create_post',
    );
    expect(authorization).toBeDefined();
    expect(authorization?.[1]).not.toHaveProperty('confirmed');
    expect(authorization?.[2]).not.toHaveProperty('approvedApprovalId');
    expect(authorization?.[2]).not.toHaveProperty(
      'confirmationOrigin',
      'thread-ui-action',
    );
    const posts = await fixture.prisma.post.findMany({
      where: {
        organizationId: actor.organizationId,
        isDeleted: false,
        agentStrategyId: actor.strategyId,
      },
    });
    expect(
      posts,
      'An approval preview is a production acceptance blocker, not a fixture-created draft',
    ).toHaveLength(1);
    expect(posts[0]).toMatchObject({
      brandId: actor.brandId,
      workflowExecutionId: execution.id,
    });
    fixture.assertTransports();
  }, 40_000);
});
