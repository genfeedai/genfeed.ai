import { BusinessLogicException } from '@api/exceptions/business-logic.exception';
import { quoteSnapshotHash } from '@api/helpers/utils/credits/quote-snapshot.util';
import {
  workflowGenerationOperationEvidenceSchema as evidenceSchema,
  workflowExecutionGenerationBillingSchema as fundingSchema,
} from '@api/helpers/utils/credits/workflow-generation-billing.schema';
import type {
  WorkflowExecutionGenerationBilling,
  WorkflowGenerationNodeAllocation,
  WorkflowGenerationOperationEvidence,
  WorkflowGenerationProviderEvidence,
} from '@genfeedai/contracts/interfaces/billing';

export function workflowGenerationOperationId(
  executionId: string,
  nodeId: string,
  actionId: string,
): string {
  return quoteSnapshotHash({ version: 1, executionId, nodeId, actionId });
}

export function assertWorkflowFundingIdentity(
  plan: WorkflowExecutionGenerationBilling,
): void {
  if (quoteSnapshotHash(plan.manifest) !== plan.manifestHash)
    throw new BusinessLogicException(
      'Workflow immutable funding manifest changed',
    );
  for (const allocation of plan.manifest.allocations) {
    if (
      allocation.operationId !==
      workflowGenerationOperationId(
        plan.manifest.executionId,
        allocation.nodeId,
        allocation.actionId,
      )
    )
      throw new BusinessLogicException(
        'Workflow operation identity differs from the frozen execution',
      );
    if (
      allocation.dispatch.contractVersion !==
      `workflow-media-v1:${quoteSnapshotHash(allocation.dispatch.preparationContract)}`
    )
      throw new BusinessLogicException(
        'Workflow preparation contract identity changed',
      );
    if (
      quoteSnapshotHash({
        ...allocation.dispatch,
        billableFingerprint: undefined,
      }) !== allocation.dispatch.billableFingerprint
    )
      throw new BusinessLogicException(
        'Workflow compiled dispatch fingerprint changed',
      );
    if (
      allocation.quote &&
      quoteSnapshotHash(allocation.quote.quantities) !==
        quoteSnapshotHash(allocation.dispatch.quantities)
    )
      throw new BusinessLogicException(
        'Workflow quote dimensions differ from the compiled dispatch',
      );
  }
}

export function assertWorkflowDispatchOpen(
  plan: WorkflowExecutionGenerationBilling,
  now = new Date(),
): void {
  assertWorkflowFundingIdentity(plan);
  if (
    plan.state !== 'funded' ||
    plan.dispatchClosed ||
    new Date(plan.expiresAt) <= now
  )
    throw new BusinessLogicException('Workflow funding admission is closed');
}

function terminal(evidence: WorkflowGenerationOperationEvidence): boolean {
  return ['completed', 'failed', 'unsubmitted'].includes(evidence.phase);
}

function comparableProof(
  evidence: WorkflowGenerationOperationEvidence,
): string {
  return quoteSnapshotHash({ ...evidence, observedAt: undefined });
}

function assertCompletionUnits(
  allocation: WorkflowGenerationNodeAllocation,
  next: WorkflowGenerationOperationEvidence,
): void {
  if (next.phase !== 'completed' || !allocation.quote) return;
  const units = {
    second: 'duration',
    'input-second': 'inputDuration',
    megapixel: 'width',
    'input-megapixel': 'inputMegapixels',
    frame: 'frames',
    'input-token': 'inputTokens',
    'output-token': 'outputTokens',
    character: 'characters',
    reference: 'references',
  } as const;
  for (const rate of allocation.quote.pricingProfile.reviewedPricing?.rates ??
    []) {
    const key = units[rate.unit as keyof typeof units];
    if (key && next.completion[key] === undefined)
      throw new BusinessLogicException(
        'Workflow completion requires actual billed units',
      );
    if (rate.unit === 'megapixel' && next.completion.height === undefined)
      throw new BusinessLogicException(
        'Workflow completion requires actual output dimensions',
      );
  }
  const profile = allocation.quote.pricingProfile;
  if (
    profile.pricingType === 'per-second' &&
    next.completion.duration === undefined
  )
    throw new BusinessLogicException(
      'Workflow completion requires actual output duration',
    );
  if (
    allocation.dispatch.quantities.selectors &&
    quoteSnapshotHash(next.completion.selectors) !==
      quoteSnapshotHash(allocation.dispatch.quantities.selectors)
  )
    throw new BusinessLogicException(
      'Workflow completion selectors differ from the admitted dispatch',
    );
}

/** Call while holding the execution lock, in the transaction that persists real output/proof. */
export function applyWorkflowOperationEvidence(
  plan: WorkflowExecutionGenerationBilling,
  incoming: WorkflowGenerationOperationEvidence,
  now = new Date(),
): WorkflowExecutionGenerationBilling {
  assertWorkflowFundingIdentity(plan);
  const next = evidenceSchema.parse(incoming);
  const allocation = plan.manifest.allocations.find(
    (item) => item.operationId === next.operationId,
  );
  const current = plan.operations.find(
    (item) => item.operationId === next.operationId,
  );
  if (!allocation || !current)
    throw new BusinessLogicException(
      'Workflow proof belongs to an unfunded operation',
    );
  if (next.phase === 'claimed' || next.phase === 'submission-intent')
    assertWorkflowDispatchOpen(plan, now);
  if (comparableProof(current) === comparableProof(next)) return plan;
  if (terminal(current)) {
    // Provider identity may be saved after an authenticated completion callback won the race.
    if (
      current.phase === 'completed' &&
      next.phase === 'accepted' &&
      current.intentId === next.intentId &&
      current.providerJobId === next.providerJobId
    )
      return plan;
    throw new BusinessLogicException(
      'Conflicting terminal workflow financial proof',
    );
  }
  if (next.phase === 'claimed') {
    assertWorkflowDispatchOpen(plan, now);
    if (!['unclaimed', 'claimed'].includes(current.phase))
      throw new BusinessLogicException(
        'Submitted workflow operations cannot be reclaimed for dispatch',
      );
  } else if (next.phase === 'submission-intent') {
    assertWorkflowDispatchOpen(plan, now);
    if (current.phase !== 'claimed')
      throw new BusinessLogicException(
        'Workflow provider intent requires its durable node claim',
      );
  } else {
    if (
      !('intentId' in current) ||
      !('intentId' in next) ||
      current.intentId !== next.intentId
    )
      throw new BusinessLogicException(
        'Workflow proof requires its existing provider intent',
      );
    if (next.phase === 'accepted' && current.phase !== 'submission-intent')
      throw new BusinessLogicException(
        'Conflicting accepted workflow provider identity',
      );
    if (
      'providerJobId' in current &&
      current.providerJobId &&
      (!('providerJobId' in next) ||
        next.providerJobId !== current.providerJobId)
    )
      throw new BusinessLogicException(
        'Workflow proof provider identity changed',
      );
    if (
      next.phase === 'failed' &&
      (next.provider !== allocation.dispatch.provider ||
        (next.kind === 'submission-rejected' && current.phase === 'accepted'))
    )
      throw new BusinessLogicException(
        'Workflow negative proof differs from its submitted operation',
      );
    assertCompletionUnits(allocation, next);
  }
  return fundingSchema.parse({
    ...plan,
    operations: plan.operations.map((item) =>
      item.operationId === next.operationId ? next : item,
    ),
  });
}

/** Closure proves only operations with no provider intent are unsubmitted. */
export function closeWorkflowDispatch(
  plan: WorkflowExecutionGenerationBilling,
  now = new Date(),
): WorkflowExecutionGenerationBilling {
  assertWorkflowFundingIdentity(plan);
  if (plan.dispatchClosed) return plan;
  return fundingSchema.parse({
    ...plan,
    dispatchClosed: true,
    operations: plan.operations.map((item) =>
      item.phase === 'unclaimed' || item.phase === 'claimed'
        ? {
            operationId: item.operationId,
            phase: 'unsubmitted',
            reason: 'dispatch-closed',
            observedAt: now.toISOString(),
          }
        : item,
    ),
  });
}

/** Submission/admission/closure cannot be smuggled through the callback proof API. */
export function parseWorkflowGenerationProviderEvidence(
  input: unknown,
): WorkflowGenerationProviderEvidence {
  const evidence = evidenceSchema.parse(input);
  if (
    evidence.phase !== 'accepted' &&
    evidence.phase !== 'completed' &&
    evidence.phase !== 'failed'
  )
    throw new BusinessLogicException(
      'Workflow callback proof cannot authorize provider dispatch',
    );
  return evidence;
}
