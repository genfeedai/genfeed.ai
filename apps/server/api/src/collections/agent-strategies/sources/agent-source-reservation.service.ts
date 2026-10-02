import {
  agentSourceIdSchema,
  agentSourceKey,
  agentSourceScopeSchema,
  agentSourceTimestampSchema,
  rankEligibleAgentSources,
  validateAgentSourceSelection,
} from '@api/collections/agent-strategies/sources/agent-source-candidates';
import { resolveAgentSourcePolicy } from '@api/collections/agent-strategies/sources/agent-source-policy';
import type {
  AgentSourceReservationStore,
  AgentSourceReserveResult,
  AgentSourceTransitionResult,
  ConsumeAgentSourceCommand,
  ReleaseAgentSourceFailureCommand,
  ReserveAgentSourceInput,
  ReuseAgentSourceCommand,
} from '@api/collections/agent-strategies/sources/agent-source-reservation.types';
import { z } from 'zod';

const bindingSchema = agentSourceScopeSchema
  .extend({
    strategyId: agentSourceIdSchema,
    executionId: agentSourceIdSchema,
    sourceKind: z.enum([
      'source_post',
      'saved_ad',
      'owned_post',
      'trend_reference',
      'library_video',
      'clip_project',
    ]),
    sourceId: agentSourceIdSchema,
  })
  .strict();
const idsSchema = z
  .array(agentSourceIdSchema)
  .min(1)
  .refine((ids) => new Set(ids).size === ids.length, 'Duplicate IDs');
const workSchema = z.union([
  z.object({ remixRunId: agentSourceIdSchema }).strict(),
  z.object({ clipResultIds: idsSchema }).strict(),
]);
const quoteSchema = z
  .object({
    quoteId: agentSourceIdSchema,
    revision: z.number().int().nonnegative(),
    inputHash: agentSourceIdSchema,
    totalCredits: z.number().nonnegative(),
    expiresAt: agentSourceTimestampSchema,
  })
  .strict();
const authorizationSchema = bindingSchema
  .extend({ ...quoteSchema.shape, authorizationId: agentSourceIdSchema })
  .strict();
const tokenSchema = bindingSchema
  .extend({
    reservationId: agentSourceIdSchema,
    generation: z.number().int().positive(),
    candidateSnapshotId: agentSourceIdSchema,
    work: workSchema,
  })
  .strict();
const reviewSchema = bindingSchema
  .extend({
    receiptId: agentSourceIdSchema,
    work: workSchema,
    postIds: idsSchema,
  })
  .strict();
const failureSchema = bindingSchema
  .extend({
    receiptId: agentSourceIdSchema,
    work: workSchema,
    status: z.enum(['failed', 'cancelled']),
    postIds: z.array(agentSourceIdSchema).length(0),
  })
  .strict();
const operatorSchema = bindingSchema
  .extend({
    actionId: agentSourceIdSchema,
    actorId: agentSourceIdSchema,
    reason: z.string().trim().min(1).max(1000),
  })
  .strict();
function sameBinding(
  left: z.infer<typeof bindingSchema>,
  right: z.infer<typeof bindingSchema>,
): boolean {
  return Object.keys(bindingSchema.shape).every(
    (key) =>
      left[key as keyof typeof left] === right[key as keyof typeof right],
  );
}
function sameWork(
  left: z.infer<typeof workSchema>,
  right: z.infer<typeof workSchema>,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

/** Internal coordinator: trusted receipts must come from authenticated persisted adapters. */
export class AgentSourceReservationService {
  constructor(
    private readonly store: AgentSourceReservationStore,
    private readonly clock: () => string,
  ) {}

  async reserve(
    input: ReserveAgentSourceInput,
  ): Promise<AgentSourceReserveResult> {
    const binding = bindingSchema.safeParse(input.binding);
    if (!binding.success) return { status: 'rejected_candidate' };
    let candidates: ReserveAgentSourceInput['candidates'];
    let policy: ReserveAgentSourceInput['policy'];
    const now = agentSourceTimestampSchema.parse(this.clock());
    try {
      policy = resolveAgentSourcePolicy(
        input.policy,
        input.policy.freshnessWindowMs,
      );
      candidates = rankEligibleAgentSources({
        scope: {
          organizationId: binding.data.organizationId,
          brandId: binding.data.brandId,
        },
        policy,
        now,
        candidates: input.candidates,
        blockedSourceKeys: new Set(),
      });
      const selected = validateAgentSourceSelection({
        scope: {
          organizationId: binding.data.organizationId,
          brandId: binding.data.brandId,
        },
        strategyId: binding.data.strategyId,
        executionId: binding.data.executionId,
        policy,
        candidates,
        selectedKeys: [input.selectedKey],
      });
      if (!selected[0] || agentSourceKey(binding.data) !== input.selectedKey)
        return { status: 'rejected_candidate' };
    } catch {
      return { status: 'rejected_candidate' };
    }
    const quote = quoteSchema.safeParse(input.quote);
    const authorization = authorizationSchema.safeParse(input.authorization);
    const work = workSchema.safeParse(input.work);
    const budget = z
      .number()
      .nonnegative()
      .safeParse(input.remainingRunCredits);
    if (
      !quote.success ||
      !authorization.success ||
      !work.success ||
      !budget.success ||
      !agentSourceIdSchema.safeParse(input.candidateSnapshotId).success ||
      !agentSourceIdSchema.safeParse(input.budgetSnapshotId).success
    )
      return { status: 'rejected_receipt' };
    if (
      !sameBinding(binding.data, authorization.data) ||
      Object.keys(quoteSchema.shape).some(
        (key) =>
          quote.data[key as keyof typeof quote.data] !==
          authorization.data[key as keyof typeof quote.data],
      ) ||
      Date.parse(quote.data.expiresAt) <= Date.parse(now)
    )
      return { status: 'rejected_receipt' };
    const candidate = candidates.find(
      (value) => agentSourceKey(value) === input.selectedKey,
    );
    if (!candidate) return { status: 'rejected_candidate' };
    const isClip =
      candidate.sourceKind === 'library_video' ||
      candidate.sourceKind === 'clip_project';
    if (isClip !== 'clipResultIds' in work.data)
      return { status: 'rejected_receipt' };
    if (quote.data.totalCredits > budget.data)
      return { status: 'skipped_budget' };
    const outcome = await this.store.tryReserve(
      freeze({
        binding: binding.data,
        candidateSnapshotId: input.candidateSnapshotId,
        candidates,
        selectedKey: input.selectedKey,
        policy,
        quote: quote.data,
        authorization: authorization.data,
        work: work.data,
        remainingRunCredits: budget.data,
        budgetSnapshotId: input.budgetSnapshotId,
        candidate,
        now,
      }),
    );
    if ('token' in outcome) {
      const token = tokenSchema.parse(outcome.token);
      if (
        !sameBinding(token, binding.data) ||
        token.candidateSnapshotId !== input.candidateSnapshotId ||
        !sameWork(token.work, work.data)
      )
        throw new Error('Persistence returned mismatched source ownership');
      return freeze({ status: outcome.status, token });
    }
    return Object.freeze({ ...outcome });
  }

  async consume(
    input: ConsumeAgentSourceCommand,
  ): Promise<AgentSourceTransitionResult> {
    const token = tokenSchema.safeParse(input.token);
    const receipt = reviewSchema.safeParse(input.receipt);
    if (
      !token.success ||
      !receipt.success ||
      !sameBinding(token.data, receipt.data) ||
      !sameWork(token.data.work, receipt.data.work)
    )
      return { status: 'rejected_receipt' };
    return this.store.consume(
      freeze({ token: token.data, receipt: receipt.data }),
    );
  }
  async releaseFailure(
    input: ReleaseAgentSourceFailureCommand,
  ): Promise<AgentSourceTransitionResult> {
    const token = tokenSchema.safeParse(input.token);
    const receipt = failureSchema.safeParse(input.receipt);
    if (
      !token.success ||
      !receipt.success ||
      !sameBinding(token.data, receipt.data) ||
      !sameWork(token.data.work, receipt.data.work)
    )
      return { status: 'rejected_receipt' };
    return this.store.releaseFailure(
      freeze({ token: token.data, receipt: receipt.data }),
    );
  }
  async releaseConsumedForReuse(
    input: ReuseAgentSourceCommand,
  ): Promise<AgentSourceTransitionResult> {
    const token = tokenSchema.safeParse(input.token);
    const receipt = operatorSchema.safeParse(input.receipt);
    if (
      !token.success ||
      !receipt.success ||
      !sameBinding(token.data, receipt.data)
    )
      return { status: 'rejected_receipt' };
    return this.store.releaseConsumedForReuse(
      freeze({ token: token.data, receipt: receipt.data }),
    );
  }
}
