import { quoteSnapshotHash } from '@api/helpers/utils/credits/quote-snapshot.util';
import { workflowExecutionGenerationBillingSchema as fundingSchema } from '@api/helpers/utils/credits/workflow-generation-billing.schema';
import {
  applyWorkflowOperationEvidence,
  assertWorkflowFundingIdentity,
  closeWorkflowDispatch,
  parseWorkflowGenerationProviderEvidence,
} from '@api/helpers/utils/credits/workflow-generation-evidence.util';
import { workflowFundingFixture } from '@api/helpers/utils/credits/workflow-generation-funding.fixture';
import { calculateWorkflowGenerationSettlement } from '@api/helpers/utils/credits/workflow-generation-settlement.util';
import type {
  WorkflowExecutionGenerationBilling,
  WorkflowGenerationOperationEvidence,
} from '@genfeedai/contracts/interfaces/billing';
import { describe, expect, it, vi } from 'vitest';

vi.unmock('@genfeedai/prisma');
const now = new Date('2026-09-30T00:01:00.000Z');
function submit(
  plan: WorkflowExecutionGenerationBilling,
  index = 0,
): WorkflowExecutionGenerationBilling {
  const operationId = plan.manifest.allocations[index].operationId;
  plan = applyWorkflowOperationEvidence(
    plan,
    { operationId, phase: 'claimed', claimId: 'claim-a' },
    now,
  );
  return applyWorkflowOperationEvidence(
    plan,
    {
      operationId,
      phase: 'submission-intent',
      intentId: operationId,
      observedAt: now.toISOString(),
    },
    now,
  );
}
function completed(
  plan: WorkflowExecutionGenerationBilling,
  index = 0,
): Extract<WorkflowGenerationOperationEvidence, { phase: 'completed' }> {
  const operationId = plan.manifest.allocations[index].operationId;
  return {
    operationId,
    phase: 'completed',
    intentId: operationId,
    proofId: `artifact-${index}`,
    observedAt: now.toISOString(),
    artifacts: [
      {
        ingredientId: `asset-${index}`,
        assetKey: `durable/video-${index}.mp4`,
        role: 'primary',
      },
    ],
    completion: { completedOutputs: 1, successfulRequests: 1 },
  };
}

describe('workflow immutable financial evidence', () => {
  it.each(['video-token', 'input-video-token'] as const)(
    'requires real completion quantities for %s',
    (unit) => {
      let plan = workflowFundingFixture();
      const quote = plan.manifest.allocations[0].quote;
      if (!quote) throw new Error('Missing quote fixture');
      quote.pricingProfile.reviewedPricing = {
        currency: 'USD',
        reviewStatus: 'approved',
        version: 'native-v1',
        sourceUrl:
          'https://fal.ai/models/bytedance/seedance-2.0/reference-to-video',
        verifiedAt: now.toISOString(),
        rates: [{ component: 'video', unit, unitPriceUsd: 0.000014, when: {} }],
      };
      plan.manifestHash = quoteSnapshotHash(plan.manifest);
      plan = submit(plan);
      const proof = completed(plan);
      expect(() => applyWorkflowOperationEvidence(plan, proof, now)).toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            detail: expect.stringContaining(
              'actual native video-token quantities',
            ),
          }),
        }),
      );
      proof.completion = {
        completedOutputs: 1,
        successfulRequests: 1,
        width: 1280,
        height: 720,
        duration: 5,
      };
      if (unit === 'input-video-token') {
        expect(() =>
          applyWorkflowOperationEvidence(plan, proof, now),
        ).toThrow();
        proof.completion.inputDuration = 10;
      }
      expect(
        applyWorkflowOperationEvidence(plan, proof, now).operations[0].phase,
      ).toBe('completed');
    },
  );
  it.each(['claimed', 'submission-intent'] as const)(
    'rejects %s evidence through the callback proof boundary',
    (phase) => {
      const operationId =
        workflowFundingFixture().manifest.allocations[0].operationId;
      expect(() =>
        parseWorkflowGenerationProviderEvidence({
          operationId,
          phase,
          claimId: 'stale-claim',
          intentId: operationId,
          observedAt: now.toISOString(),
        }),
      ).toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            detail: expect.stringContaining(
              'cannot authorize provider dispatch',
            ),
          }),
        }),
      );
    },
  );

  it('refuses old or crossed projection contracts instead of fabricating missing funding evidence', () => {
    const missing = structuredClone(workflowFundingFixture());
    const old = missing.manifest.allocations[0].dispatch as unknown as Record<
      string,
      unknown
    >;
    delete old.preparationContract;
    delete old.projectionPolicy;
    expect(fundingSchema.safeParse(missing).success).toBe(false);
    const crossed = structuredClone(workflowFundingFixture());
    crossed.manifest.allocations[0].dispatch.projectionPolicy = {
      kind: 'exact-provider-input',
      version: 1,
      inputKeys: [],
      inputFingerprint: quoteSnapshotHash({}),
    };
    expect(fundingSchema.safeParse(crossed).success).toBe(false);
  });
  it('requires exact-input BYOK policy with no quote or guessed selectors', () => {
    const plan = workflowFundingFixture();
    const allocation = plan.manifest.allocations[0];
    allocation.billingMode = 'byok';
    delete allocation.quote;
    allocation.dispatch.credentialRoute = {
      kind: 'byok',
      credentialId: 'test-key',
    };
    allocation.dispatch.projectionPolicy = {
      kind: 'exact-provider-input',
      version: 1,
      inputKeys: [],
      inputFingerprint: quoteSnapshotHash({}),
    };
    expect(fundingSchema.safeParse(plan).success).toBe(true);
    allocation.dispatch.quantities.selectors = {};
    expect(fundingSchema.safeParse(plan).success).toBe(false);
    delete allocation.dispatch.quantities.selectors;
    allocation.dispatch.projectionPolicy.inputKeys = ['z', 'a'];
    expect(fundingSchema.safeParse(plan).success).toBe(false);
    allocation.dispatch.projectionPolicy.inputKeys = ['a', 'a'];
    expect(fundingSchema.safeParse(plan).success).toBe(false);
  });
  it('binds the structured preparation contract even after the outer dispatch hash is recomputed', () => {
    const plan = workflowFundingFixture();
    const dispatch = plan.manifest.allocations[0].dispatch;
    dispatch.preparationContract.brief.compilerVersion++;
    dispatch.billableFingerprint = quoteSnapshotHash({
      ...dispatch,
      billableFingerprint: undefined,
    });
    plan.manifestHash = quoteSnapshotHash(plan.manifest);
    expect(() => assertWorkflowFundingIdentity(plan)).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({
          detail: 'Workflow preparation contract identity changed',
        }),
      }),
    );
  });
  it.each(['model', 'target', 'kind', 'profile'] as const)(
    'rejects forged cross-field prepared %s identity',
    (field) => {
      const plan = workflowFundingFixture();
      const allocation = plan.manifest.allocations[0];
      if (field === 'model')
        allocation.dispatch.preparationContract.brief.modelKey =
          'different/model';
      if (field === 'target')
        allocation.dispatch.target = JSON.stringify({ version: 'different' });
      if (field === 'kind')
        allocation.dispatch.preparationContract.brief.mediaKind = 'image';
      if (field === 'profile' && allocation.quote)
        allocation.quote.pricingProfile.key = 'different/model';
      expect(fundingSchema.safeParse(plan).success).toBe(false);
    },
  );
  it('uses stable retry identity and isolates a fresh execution', () => {
    const first = workflowFundingFixture();
    expect(workflowFundingFixture().manifestHash).toBe(first.manifestHash);
    expect(
      workflowFundingFixture('execution-b').manifest.allocations[0].operationId,
    ).not.toBe(first.manifest.allocations[0].operationId);
  });
  it('reserves test video 5 plus image 1, settles completed video 5 and releases the failed image share', () => {
    let plan = submit(submit(workflowFundingFixture()), 1);
    plan = applyWorkflowOperationEvidence(plan, completed(plan), now);
    const operationId = plan.manifest.allocations[1].operationId;
    plan = applyWorkflowOperationEvidence(
      plan,
      {
        operationId,
        phase: 'failed',
        intentId: operationId,
        proofId: 'confirmed-job-failure',
        observedAt: now.toISOString(),
        kind: 'provider-terminal',
        provider: 'replicate',
      },
      now,
    );
    expect(plan.holdAmount).toBe('6');
    expect(
      calculateWorkflowGenerationSettlement(closeWorkflowDispatch(plan, now)),
    ).toMatchObject({
      actualAmount: 5,
      operations: [
        { credits: 5, phase: 'completed' },
        { credits: 0, phase: 'failed' },
      ],
    });
  });
  it.each(['unclaimed', 'claimed'] as const)(
    'closure proves only %s work unsubmitted',
    (phase) => {
      let plan = workflowFundingFixture();
      if (phase === 'claimed')
        plan = applyWorkflowOperationEvidence(
          plan,
          {
            operationId: plan.manifest.allocations[0].operationId,
            phase,
            claimId: 'claim-a',
          },
          now,
        );
      plan = closeWorkflowDispatch(plan, now);
      expect(
        plan.operations.every((evidence) => evidence.phase === 'unsubmitted'),
      ).toBe(true);
      expect(calculateWorkflowGenerationSettlement(plan)?.actualAmount).toBe(0);
    },
  );
  it('retains an ambiguous submission after closure and settles an actual late output', () => {
    let plan = closeWorkflowDispatch(submit(workflowFundingFixture()), now);
    expect(plan.operations[0].phase).toBe('submission-intent');
    expect(calculateWorkflowGenerationSettlement(plan)).toBeNull();
    plan = applyWorkflowOperationEvidence(
      plan,
      completed(plan),
      new Date('2026-10-02'),
    );
    expect(calculateWorkflowGenerationSettlement(plan)?.actualAmount).toBe(5);
  });
  it('denies intent replay after closure even for the identical operation', () => {
    const plan = closeWorkflowDispatch(submit(workflowFundingFixture()), now);
    expect(() =>
      applyWorkflowOperationEvidence(plan, plan.operations[0], now),
    ).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({
          detail: expect.stringContaining('admission is closed'),
        }),
      }),
    );
  });
  it('denies a provider intent after a claimed-but-unsubmitted node loses the closure race', () => {
    const initial = workflowFundingFixture();
    const operationId = initial.manifest.allocations[0].operationId;
    const claimed = applyWorkflowOperationEvidence(
      initial,
      { operationId, phase: 'claimed', claimId: 'claim-a' },
      now,
    );
    const closed = closeWorkflowDispatch(claimed, now);
    expect(() =>
      applyWorkflowOperationEvidence(
        closed,
        {
          operationId,
          phase: 'submission-intent',
          intentId: operationId,
          observedAt: now.toISOString(),
        },
        now,
      ),
    ).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({
          detail: expect.stringContaining('admission is closed'),
        }),
      }),
    );
  });
  it('denies admission after expiry and while preparation is unfinished', () => {
    const plan = workflowFundingFixture();
    const claim: WorkflowGenerationOperationEvidence = {
      operationId: plan.manifest.allocations[0].operationId,
      phase: 'claimed',
      claimId: 'claim-a',
    };
    expect(() =>
      applyWorkflowOperationEvidence(plan, claim, new Date('2099-01-02')),
    ).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({
          detail: expect.stringContaining('admission is closed'),
        }),
      }),
    );
    expect(() =>
      applyWorkflowOperationEvidence(
        { ...plan, state: 'preparing' },
        claim,
        now,
      ),
    ).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({
          detail: expect.stringContaining('admission is closed'),
        }),
      }),
    );
  });
  it('replays identical completion but rejects conflicting failure or artifact proof', () => {
    let plan = submit(workflowFundingFixture());
    const proof = completed(plan);
    plan = applyWorkflowOperationEvidence(plan, proof, now);
    expect(
      applyWorkflowOperationEvidence(
        plan,
        { ...proof, observedAt: '2026-10-02T00:00:00.000Z' },
        now,
      ),
    ).toBe(plan);
    if (proof.phase !== 'completed') throw new Error('Invalid fixture');
    expect(() =>
      applyWorkflowOperationEvidence(
        plan,
        {
          ...proof,
          artifacts: [{ ...proof.artifacts[0], assetKey: 'different.mp4' }],
        },
        now,
      ),
    ).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({
          detail: expect.stringContaining('Conflicting terminal'),
        }),
      }),
    );
    expect(() =>
      applyWorkflowOperationEvidence(
        plan,
        {
          operationId: proof.operationId,
          phase: 'failed',
          intentId: proof.intentId,
          provider: 'replicate',
          proofId: 'failure',
          kind: 'provider-terminal',
          observedAt: now.toISOString(),
        },
        now,
      ),
    ).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({
          detail: expect.stringContaining('Conflicting terminal'),
        }),
      }),
    );
  });
  it('does not permit a generic projection to create completion without provider intent', () => {
    const plan = workflowFundingFixture();
    expect(() =>
      applyWorkflowOperationEvidence(plan, completed(plan), now),
    ).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({
          detail: expect.stringContaining('existing provider intent'),
        }),
      }),
    );
  });
  it('requires a completed artifact and successful request cardinality', () => {
    const plan = submit(workflowFundingFixture());
    const proof = completed(plan);
    if (proof.phase !== 'completed') throw new Error('Invalid fixture');
    expect(() =>
      applyWorkflowOperationEvidence(plan, { ...proof, artifacts: [] }, now),
    ).toThrow();
    expect(() =>
      applyWorkflowOperationEvidence(
        plan,
        {
          ...proof,
          completion: { completedOutputs: 0, successfulRequests: 1 },
        },
        now,
      ),
    ).toThrow();
  });
  it('rejects changed dispatch targets, quote selectors and provider identities', () => {
    let plan = submit(workflowFundingFixture());
    const mutated = structuredClone(plan);
    mutated.manifest.allocations[0].dispatch.target = 'another/endpoint';
    expect(() => assertWorkflowFundingIdentity(mutated)).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({
          detail: expect.stringContaining('manifest changed'),
        }),
      }),
    );
    expect(() =>
      applyWorkflowOperationEvidence(
        plan,
        {
          operationId: plan.manifest.allocations[0].operationId,
          phase: 'failed',
          intentId: plan.manifest.allocations[0].operationId,
          proofId: 'foreign-provider',
          observedAt: now.toISOString(),
          kind: 'provider-terminal',
          provider: 'heygen',
        },
        now,
      ),
    ).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({
          detail: expect.stringContaining(
            'differs from its submitted operation',
          ),
        }),
      }),
    );
    const operationId = plan.manifest.allocations[0].operationId;
    plan = applyWorkflowOperationEvidence(
      plan,
      {
        operationId,
        phase: 'accepted',
        intentId: operationId,
        providerJobId: 'job-a',
        observedAt: now.toISOString(),
      },
      now,
    );
    expect(() =>
      applyWorkflowOperationEvidence(
        plan,
        {
          ...completed(plan),
          providerJobId: 'job-b',
        },
        now,
      ),
    ).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({
          detail: expect.stringContaining('provider identity changed'),
        }),
      }),
    );
  });
  it('requires actual duration for a frozen per-second tariff', () => {
    let initial = workflowFundingFixture();
    const quote = initial.manifest.allocations[0].quote;
    if (!quote) throw new Error('Invalid fixture');
    quote.pricingProfile.pricingType = 'per-second';
    quote.quantities.duration = 1;
    initial.manifest.allocations[0].dispatch.quantities.duration = 1;
    const dispatch = initial.manifest.allocations[0].dispatch;
    dispatch.billableFingerprint = quoteSnapshotHash({
      ...dispatch,
      billableFingerprint: undefined,
    });
    initial.manifestHash = quoteSnapshotHash(initial.manifest);
    initial = submit(initial);
    expect(() =>
      applyWorkflowOperationEvidence(initial, completed(initial), now),
    ).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({
          detail: expect.stringContaining('actual output duration'),
        }),
      }),
    );
  });
  it('rejects missing explicit output counts and incomplete operation coverage', () => {
    const plan = workflowFundingFixture();
    const invalid = structuredClone(plan);
    if (!invalid.manifest.allocations[0].quote)
      throw new Error('Invalid fixture');
    delete invalid.manifest.allocations[0].quote.quantities.outputs;
    expect(fundingSchema.safeParse(invalid).success).toBe(false);
    expect(fundingSchema.safeParse({ ...plan, operations: [] }).success).toBe(
      false,
    );
  });
});
