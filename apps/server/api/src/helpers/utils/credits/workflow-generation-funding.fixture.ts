import { billableProfile } from '@api/helpers/utils/credits/model-billable-quote.fixture';
import { quoteSnapshotHash } from '@api/helpers/utils/credits/quote-snapshot.util';
import { workflowGenerationOperationId } from '@api/helpers/utils/credits/workflow-generation-evidence.util';
import type {
  WorkflowExecutionGenerationBilling,
  WorkflowGenerationDispatch,
  WorkflowGenerationNodeAllocation,
  WorkflowMediaPreparationContract,
} from '@genfeedai/contracts/interfaces/billing';
import { quoteModelBillablePricing } from '@genfeedai/pricing';

/** Explicit test tariffs: video 5 credits and image 1 credit; never a production fallback. */
export function workflowFundingFixture(
  executionId = 'execution-a',
): WorkflowExecutionGenerationBilling {
  const allocations = [
    ['video', 'videoGen', 5],
    ['image', 'imageGen', 1],
  ].map(([node, action, cost]): WorkflowGenerationNodeAllocation => {
    const nodeId = String(node);
    const actionId = String(action);
    const modelKey = `test/${nodeId}`;
    const provider = 'replicate';
    const quote = quoteModelBillablePricing(
      billableProfile({ key: modelKey, provider, cost: Number(cost) }),
      { modelKey, provider, requests: 1, outputs: 1 },
      1,
      '2026-09-30T00:00:00.000Z',
    );
    if (quote.status !== 'priced') throw new Error(quote.reason);
    // Synthetic reviewed identities are deliberate financial test inputs only.
    const preparationContract: WorkflowMediaPreparationContract = {
      version: 1,
      preparationVersion: 1,
      actionId: actionId === 'videoGen' ? 'videoGen' : 'imageGen',
      brief: {
        briefVersion: 1,
        compilerId: 'synthetic-test-compiler',
        compilerVersion: 1,
        profileId: 'synthetic-test-profile',
        profileVersion: 1,
        modelKey,
        mediaKind: nodeId === 'video' ? 'video' : 'image',
      },
      reviewedOutput: {
        modelKey,
        provider: 'replicate',
        endpoint: modelKey,
        version: 'synthetic-reviewed-test-v1',
        target: { model: modelKey },
        output: {
          adapterVersion: 1,
          representation: 'uri',
          requests: 1,
          outputs: 1,
        },
      },
    };
    const compiled: Omit<WorkflowGenerationDispatch, 'billableFingerprint'> = {
      contractVersion: `workflow-media-v1:${quoteSnapshotHash(preparationContract)}`,
      preparationContract,
      projectionPolicy: { kind: 'frozen-pricing-profile', version: 1 },
      modelKey,
      provider,
      target: JSON.stringify({ model: modelKey }),
      credentialRoute: { kind: 'platform' },
      quantities: { requests: 1, outputs: 1 },
    };
    return {
      nodeId,
      actionId,
      operationId: workflowGenerationOperationId(executionId, nodeId, actionId),
      owner: 'workflow-execution',
      billingMode: 'credits',
      dispatch: {
        ...compiled,
        billableFingerprint: quoteSnapshotHash(compiled),
      },
      quote: quote.snapshot,
    };
  });
  const manifest = {
    executionId,
    organizationId: 'org-a',
    actorUserId: 'user-a',
    workflowVersionId: 'version-a',
    selectedNodeIds: ['video', 'image'],
    graphFingerprint: quoteSnapshotHash(['video', 'image']),
    allocations,
  };
  return {
    version: 1,
    state: 'funded',
    manifest,
    manifestHash: quoteSnapshotHash(manifest),
    holdAmount: '6',
    reservationId: `hold-${executionId}`,
    expiresAt: '2026-10-01T00:00:00.000Z',
    dispatchClosed: false,
    operations: allocations.map((allocation) => ({
      operationId: allocation.operationId,
      phase: 'unclaimed',
    })),
  };
}
