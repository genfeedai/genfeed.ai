import {
  type AgentSourceCandidate,
  agentSourceKey,
} from '@api/collections/agent-strategies/sources/agent-source-candidates';
import { resolveAgentSourcePolicy } from '@api/collections/agent-strategies/sources/agent-source-policy';
import { AgentSourceReservationService } from '@api/collections/agent-strategies/sources/agent-source-reservation.service';
import type {
  AgentSourceBinding,
  AgentSourceFailureReceipt,
  AgentSourceOperatorReceipt,
  AgentSourceOwnershipToken,
  AgentSourceReservationStore,
  AgentSourceReserveOutcome,
  AgentSourceReviewReceipt,
  AgentSourceTransitionOutcome,
  ConsumeAgentSourceCommand,
  ReleaseAgentSourceFailureCommand,
  ReserveAgentSourceCommand,
  ReserveAgentSourceInput,
  ReuseAgentSourceCommand,
} from '@api/collections/agent-strategies/sources/agent-source-reservation.types';
import { describe, expect, it } from 'vitest';

function sameToken(
  left: AgentSourceOwnershipToken,
  right: AgentSourceOwnershipToken,
): boolean {
  return (
    left.organizationId === right.organizationId &&
    left.brandId === right.brandId &&
    left.strategyId === right.strategyId &&
    left.executionId === right.executionId &&
    left.sourceKind === right.sourceKind &&
    left.sourceId === right.sourceId &&
    left.reservationId === right.reservationId &&
    left.generation === right.generation &&
    left.candidateSnapshotId === right.candidateSnapshotId &&
    JSON.stringify(left.work) === JSON.stringify(right.work)
  );
}
interface FixtureRow {
  token: AgentSourceOwnershipToken;
  command: ReserveAgentSourceCommand;
  status: 'reserved' | 'consumed' | 'released';
  receipt?: string;
}
/** Test-only synchronous atomic model. Does not establish Postgres serializability. */
class AtomicFixtureStore implements AgentSourceReservationStore {
  writes = 0;
  attempts = 0;
  eligibility = true;
  readonly rows = new Map<string, FixtureRow>();
  readonly audit: string[] = [];
  readonly operatorActions = new Map<string, string>();
  key(binding: AgentSourceBinding) {
    return JSON.stringify([
      binding.organizationId,
      binding.brandId,
      binding.strategyId,
      binding.sourceKind,
      binding.sourceId,
    ]);
  }
  async tryReserve(
    command: ReserveAgentSourceCommand,
  ): Promise<AgentSourceReserveOutcome> {
    this.attempts++;
    expect(Object.isFrozen(command)).toBe(true);
    expect(Object.isFrozen(command.authorization)).toBe(true);
    expect(Object.isFrozen(command.candidate.selector)).toBe(true);
    if (!this.eligibility) return { status: 'stale_inputs' };
    const key = this.key(command.binding);
    const previous = this.rows.get(key);
    if (
      previous?.status === 'reserved' &&
      previous.token.executionId === command.binding.executionId
    ) {
      if (
        JSON.stringify({ ...previous.command, now: command.now }) !==
        JSON.stringify(command)
      )
        return { status: 'stale_inputs' };
      return {
        status: 'already_reserved_same_execution',
        token: previous.token,
      };
    }
    if (
      previous &&
      (previous.status !== 'released' ||
        previous.token.executionId === command.binding.executionId)
    )
      return { status: 'unavailable' };
    const commitments = [...this.rows.values()].filter(
      (row) =>
        row.token.organizationId === command.binding.organizationId &&
        row.token.brandId === command.binding.brandId &&
        row.token.strategyId === command.binding.strategyId &&
        row.token.executionId === command.binding.executionId &&
        row.status !== 'released',
    );
    if (
      commitments.some(
        (row) =>
          row.command.budgetSnapshotId !== command.budgetSnapshotId ||
          row.command.remainingRunCredits !== command.remainingRunCredits ||
          row.command.candidateSnapshotId !== command.candidateSnapshotId ||
          JSON.stringify(row.command.policy) !== JSON.stringify(command.policy),
      )
    )
      return { status: 'stale_inputs' };
    if (commitments.length >= command.policy.perRunSourceLimit)
      return { status: 'source_limit' };
    if (
      commitments.reduce(
        (sum, row) => sum + row.command.quote.totalCredits,
        0,
      ) +
        command.quote.totalCredits >
      command.remainingRunCredits
    )
      return { status: 'skipped_budget' };
    const token: AgentSourceOwnershipToken = Object.freeze({
      ...command.binding,
      reservationId:
        previous?.token.reservationId ?? `reservation-${this.rows.size}`,
      generation: (previous?.token.generation ?? 0) + 1,
      candidateSnapshotId: command.candidateSnapshotId,
      work: command.work,
    });
    this.rows.set(key, { token, command, status: 'reserved' });
    this.writes++;
    this.audit.push(`reserve:${token.executionId}:${token.generation}`);
    return { status: 'reserved', token };
  }
  transition(
    token: AgentSourceOwnershipToken,
    receipt: string,
    desired: 'consumed' | 'released',
  ): AgentSourceTransitionOutcome {
    const row = this.rows.get(this.key(token));
    if (!row || !sameToken(row.token, token)) return { status: 'stale_token' };
    if (row.status === desired)
      return {
        status:
          row.receipt === receipt ? 'already_applied' : 'receipt_mismatch',
      };
    if (row.status !== 'reserved') return { status: 'invalid_state' };
    row.status = desired;
    row.receipt = receipt;
    this.writes++;
    this.audit.push(receipt);
    return { status: 'applied' };
  }
  async consume(
    command: ConsumeAgentSourceCommand,
  ): Promise<AgentSourceTransitionOutcome> {
    return this.transition(
      command.token,
      JSON.stringify(command.receipt),
      'consumed',
    );
  }
  async releaseFailure(
    command: ReleaseAgentSourceFailureCommand,
  ): Promise<AgentSourceTransitionOutcome> {
    return this.transition(
      command.token,
      JSON.stringify(command.receipt),
      'released',
    );
  }
  async releaseConsumedForReuse(
    command: ReuseAgentSourceCommand,
  ): Promise<AgentSourceTransitionOutcome> {
    const actionKey = JSON.stringify([
      this.key(command.token),
      command.receipt.actionId,
    ]);
    const serialized = JSON.stringify(command);
    const replay = this.operatorActions.get(actionKey);
    if (replay)
      return {
        status: replay === serialized ? 'already_applied' : 'receipt_mismatch',
      };
    const row = this.rows.get(this.key(command.token));
    if (!row || !sameToken(row.token, command.token))
      return { status: 'stale_token' };
    if (row.status !== 'consumed') return { status: 'invalid_state' };
    row.status = 'released';
    row.token = Object.freeze({
      ...row.token,
      generation: row.token.generation + 1,
    });
    this.operatorActions.set(actionKey, serialized);
    this.writes++;
    this.audit.push(serialized);
    return { status: 'applied' };
  }
}
const now = '2026-10-01T12:00:00Z';
const scope = { organizationId: 'orgA', brandId: 'brandA' };
function candidate(sourceId = 'I1'): AgentSourceCandidate {
  return {
    scope,
    sourceKind: 'source_post',
    sourceId,
    selector: { kind: 'source_post', sourcePostId: sourceId },
    observedAt: '2026-10-01T11:00:00Z',
    usageAllowed: true,
    isDeleted: false,
  };
}
function request(
  credits = 5,
  executionId = 'E1',
  sourceId = 'I1',
): ReserveAgentSourceInput {
  const binding: AgentSourceBinding = {
    ...scope,
    strategyId: 'strategy',
    executionId,
    sourceKind: 'source_post',
    sourceId,
  };
  const quote = {
    quoteId: `quote-${sourceId}`,
    revision: 1,
    inputHash: `hash-${sourceId}`,
    totalCredits: credits,
    expiresAt: '2026-10-01T12:15:00Z',
  };
  return {
    binding,
    candidateSnapshotId: 'snapshot',
    candidates: [candidate('I1'), candidate('I2')],
    selectedKey: agentSourceKey(candidate(sourceId)),
    policy: resolveAgentSourcePolicy(undefined, 7 * 24 * 60 * 60 * 1000),
    quote,
    authorization: { ...binding, ...quote, authorizationId: 'approval' },
    work: { remixRunId: `run-${executionId}-${sourceId}` },
    remainingRunCredits: 5,
    budgetSnapshotId: 'budget',
  };
}
function setup() {
  const store = new AtomicFixtureStore();
  const service = new AgentSourceReservationService(store, () => now);
  return { store, service };
}
async function reserve(
  service: AgentSourceReservationService,
  input = request(),
): Promise<AgentSourceOwnershipToken> {
  const result = await service.reserve(input);
  if (!('token' in result))
    throw new Error(`Expected reservation, received ${result.status}`);
  return result.token;
}
function review(
  token: AgentSourceOwnershipToken,
  postIds: readonly string[] = ['P1'],
): AgentSourceReviewReceipt {
  const {
    organizationId,
    brandId,
    strategyId,
    executionId,
    sourceKind,
    sourceId,
  } = token;
  return {
    organizationId,
    brandId,
    strategyId,
    executionId,
    sourceKind,
    sourceId,
    receiptId: 'review',
    work: token.work,
    postIds,
  };
}
function failure(token: AgentSourceOwnershipToken): AgentSourceFailureReceipt {
  const { postIds, ...binding } = review(token);
  return { ...binding, status: 'failed', postIds: [] };
}
function operator(
  token: AgentSourceOwnershipToken,
): AgentSourceOperatorReceipt {
  const { receiptId, work, postIds, ...binding } = review(token);
  return {
    ...binding,
    actionId: 'reuse',
    actorId: 'operator',
    reason: 'Approved new execution',
  };
}

describe('Agent source reservation coordinator', () => {
  it('skips over-budget quote before any persistence attempt', async () => {
    const { store, service } = setup();
    expect(await service.reserve(request(6))).toEqual({
      status: 'skipped_budget',
    });
    expect(store.attempts).toBe(0);
    expect(store.writes).toBe(0);
  });
  it('allows exact budget and returns same immutable token on replay', async () => {
    const { store, service } = setup();
    const input = request();
    const token = await reserve(service, input);
    expect(await service.reserve(input)).toEqual({
      status: 'already_reserved_same_execution',
      token,
    });
    expect(store.writes).toBe(1);
    expect(Object.isFrozen(token.work)).toBe(true);
  });
  it('permits an authoritative zero quote without inferring a free provider', async () => {
    const { store, service } = setup();
    expect(
      (await service.reserve({ ...request(0), remainingRunCredits: 0 })).status,
    ).toBe('reserved');
    expect(store.writes).toBe(1);
  });
  it('rejects nonfinite/negative quote and budget before persistence', async () => {
    const { store, service } = setup();
    for (const value of [NaN, Infinity, -1]) {
      expect((await service.reserve(request(value))).status).toBe(
        'rejected_receipt',
      );
      expect(
        (await service.reserve({ ...request(), remainingRunCredits: value }))
          .status,
      ).toBe('rejected_receipt');
    }
    expect(store.attempts).toBe(0);
  });
  it('rejects missing, expired and mismatched authorization receipts', async () => {
    const { store, service } = setup();
    expect(
      (
        await service.reserve({
          ...request(),
          authorization: undefined,
        } as unknown as ReserveAgentSourceInput)
      ).status,
    ).toBe('rejected_receipt');
    const input = request();
    expect(
      (
        await service.reserve({
          ...input,
          authorization: { ...input.authorization, brandId: 'other' },
        })
      ).status,
    ).toBe('rejected_receipt');
    expect(
      (
        await service.reserve({
          ...input,
          authorization: { ...input.authorization, inputHash: 'other' },
        })
      ).status,
    ).toBe('rejected_receipt');
    const expired = { ...input.quote, expiresAt: now };
    expect(
      (
        await service.reserve({
          ...input,
          quote: expired,
          authorization: { ...input.authorization, ...expired },
        })
      ).status,
    ).toBe('rejected_receipt');
    expect(store.attempts).toBe(0);
  });
  it('rejects out-of-snapshot sources before persistence', async () => {
    const { store, service } = setup();
    expect((await service.reserve(request(5, 'E1', 'unknown'))).status).toBe(
      'rejected_candidate',
    );
    expect(store.attempts).toBe(0);
  });
  it('prevents a conflicting execution owner and rejects changed same-run quote', async () => {
    const { store, service } = setup();
    await reserve(service);
    expect((await service.reserve(request(5, 'E2'))).status).toBe(
      'unavailable',
    );
    expect((await service.reserve(request(4))).status).toBe('stale_inputs');
    expect(store.writes).toBe(1);
  });
  it('enforces aggregate budget atomically across simultaneous distinct sources', async () => {
    const { store, service } = setup();
    const policy = resolveAgentSourcePolicy(
      { perRunSourceLimit: 2 },
      1000 * 60 * 60 * 24 * 7,
    );
    const results = await Promise.all([
      service.reserve({ ...request(4), policy }),
      service.reserve({ ...request(4, 'E1', 'I2'), policy }),
    ]);
    expect(results.map((result) => result.status)).toEqual([
      'reserved',
      'skipped_budget',
    ]);
    expect(store.writes).toBe(1);
  });
  it('enforces per-run slots atomically beyond independent selection prechecks', async () => {
    const { service, store } = setup();
    await reserve(service, request(0));
    expect((await service.reserve(request(0, 'E1', 'I2'))).status).toBe(
      'source_limit',
    );
    expect(store.writes).toBe(1);
  });
  it('revalidates persisted eligibility in the store at reserve time', async () => {
    const { store, service } = setup();
    store.eligibility = false;
    expect((await service.reserve(request())).status).toBe('stale_inputs');
    expect(store.writes).toBe(0);
  });
  it('rejects provider-success without distinct persisted review draft IDs', async () => {
    const { store, service } = setup();
    const token = await reserve(service);
    for (const postIds of [[], ['P1', 'P1']])
      expect(
        (await service.consume({ token, receipt: review(token, postIds) }))
          .status,
      ).toBe('rejected_receipt');
    expect(store.writes).toBe(1);
  });
  it('rejects wrong canonical work, scope and both/neither output families', async () => {
    const { store, service } = setup();
    const token = await reserve(service);
    const receipt = review(token);
    for (const invalid of [
      { ...receipt, brandId: 'other' },
      { ...receipt, work: { remixRunId: 'other' } },
      { ...receipt, work: {} },
      { ...receipt, work: { remixRunId: 'r', clipResultIds: ['c'] } },
    ])
      expect(
        (
          await service.consume({
            token,
            receipt: invalid as AgentSourceReviewReceipt,
          })
        ).status,
      ).toBe('rejected_receipt');
    expect(store.writes).toBe(1);
  });
  it('consumes only after review and replays identical receipt while rejecting a mismatch', async () => {
    const { store, service } = setup();
    const token = await reserve(service);
    expect(
      (await service.consume({ token, receipt: review(token) })).status,
    ).toBe('applied');
    expect(
      (await service.consume({ token, receipt: review(token) })).status,
    ).toBe('already_applied');
    expect(
      (await service.consume({ token, receipt: review(token, ['P2']) })).status,
    ).toBe('receipt_mismatch');
    expect((await service.reserve(request(5, 'E2'))).status).toBe(
      'unavailable',
    );
    expect(store.writes).toBe(2);
  });
  it('rejects stale generation token without a write', async () => {
    const { store, service } = setup();
    const token = await reserve(service);
    expect(
      (
        await service.consume({
          token: { ...token, generation: token.generation + 1 },
          receipt: review(token),
        })
      ).status,
    ).toBe('stale_token');
    expect(store.writes).toBe(1);
  });
  it('releases terminal no-draft failure idempotently and requires a new execution to retry', async () => {
    const { store, service } = setup();
    const token = await reserve(service);
    expect(
      (await service.releaseFailure({ token, receipt: failure(token) })).status,
    ).toBe('applied');
    expect(
      (await service.releaseFailure({ token, receipt: failure(token) })).status,
    ).toBe('already_applied');
    expect((await service.reserve(request())).status).toBe('unavailable');
    const next = await reserve(service, request(5, 'E2'));
    expect(next.generation).toBeGreaterThan(token.generation);
    expect(store.writes).toBe(3);
  });
  it('keeps ambiguous or partially successful work reserved/consumed', async () => {
    const { store, service } = setup();
    const token = await reserve(service);
    expect(
      (
        await service.releaseFailure({
          token,
          receipt: {
            ...failure(token),
            status: 'pending',
          } as unknown as AgentSourceFailureReceipt,
        })
      ).status,
    ).toBe('rejected_receipt');
    expect(
      (
        await service.releaseFailure({
          token,
          receipt: { ...failure(token), postIds: ['P1'] },
        })
      ).status,
    ).toBe('rejected_receipt');
    await service.consume({ token, receipt: review(token) });
    expect(
      (await service.releaseFailure({ token, receipt: failure(token) })).status,
    ).toBe('invalid_state');
    expect(store.writes).toBe(2);
  });
  it('operator reuse fences late callbacks, retains audit and replays the same action', async () => {
    const { store, service } = setup();
    const old = await reserve(service);
    await service.consume({ token: old, receipt: review(old) });
    const command = { token: old, receipt: operator(old) };
    expect((await service.releaseConsumedForReuse(command)).status).toBe(
      'applied',
    );
    expect((await service.releaseConsumedForReuse(command)).status).toBe(
      'already_applied',
    );
    const next = await reserve(service, request(5, 'E2'));
    const before = store.writes;
    expect(
      (await service.consume({ token: old, receipt: review(old) })).status,
    ).toBe('stale_token');
    expect(
      (await service.releaseFailure({ token: old, receipt: failure(old) }))
        .status,
    ).toBe('stale_token');
    expect(store.writes).toBe(before);
    expect(next.generation).toBeGreaterThan(old.generation);
    expect(store.audit.some((entry) => entry.includes('operator'))).toBe(true);
    expect(store.audit.some((entry) => entry.includes('P1'))).toBe(true);
  });
  it('operator reuse cannot cancel active reservations or accept foreign scope', async () => {
    const { store, service } = setup();
    const token = await reserve(service);
    expect(
      (
        await service.releaseConsumedForReuse({
          token,
          receipt: operator(token),
        })
      ).status,
    ).toBe('invalid_state');
    expect(
      (
        await service.releaseConsumedForReuse({
          token,
          receipt: { ...operator(token), organizationId: 'other' },
        })
      ).status,
    ).toBe('rejected_receipt');
    expect(store.writes).toBe(1);
  });
  it('allows identical reserve replay after the injected clock advances', async () => {
    const store = new AtomicFixtureStore();
    let clockTime = now;
    const service = new AgentSourceReservationService(store, () => clockTime);
    const input = request();
    const token = await reserve(service, input);
    clockTime = '2026-10-01T12:01:00Z';
    expect(await service.reserve(input)).toEqual({
      status: 'already_reserved_same_execution',
      token,
    });
    expect(store.writes).toBe(1);
  });
  it('preserves persistence failures instead of converting them to eligibility success', async () => {
    const { store, service } = setup();
    store.tryReserve = async () => {
      throw new Error('database unavailable');
    };
    await expect(service.reserve(request())).rejects.toThrow(
      'database unavailable',
    );
  });
});
