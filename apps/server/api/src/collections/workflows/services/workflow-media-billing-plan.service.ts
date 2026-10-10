import { ModelCreditQuoteService } from '@api/collections/models/services/model-credit-quote.service';
import { findReviewedReplicateOutputContract } from '@api/collections/models/utils/model-reviewed-replicate-output-contract.util';
import { WorkflowMediaCredentialRouteService } from '@api/collections/workflows/services/workflow-media-credential-route.service';
import type { WorkflowMediaProviderPlan } from '@api/collections/workflows/services/workflow-media-provider-plan.interface';
import { WorkflowMediaProviderPlanService } from '@api/collections/workflows/services/workflow-media-provider-plan.service';
import { BusinessLogicException } from '@api/exceptions/business-logic.exception';
import { normalizeModelProviderQuoteRequest } from '@api/helpers/utils/credits/model-provider-quote-request.util';
import { quoteSnapshotHash } from '@api/helpers/utils/credits/quote-snapshot.util';
import {
  workflowExecutionGenerationBillingSchema,
  workflowGenerationNodeAllocationSchema,
} from '@api/helpers/utils/credits/workflow-generation-billing.schema';
import {
  assertWorkflowFundingIdentity,
  workflowGenerationOperationId,
} from '@api/helpers/utils/credits/workflow-generation-evidence.util';
import {
  assertWorkflowMediaPricingUnits,
  projectWorkflowMediaProviderInput,
} from '@api/helpers/utils/credits/workflow-media-dispatch-input.util';
import type { ResolvedByokCredential } from '@api/services/byok/byok-credential-identity.interface';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ByokProvider } from '@genfeedai/contracts';
import type {
  WorkflowExecutionGenerationBilling,
  WorkflowGenerationDispatch,
  WorkflowGenerationNodeAllocation,
  WorkflowMediaPreparationContract,
  WorkflowReviewedOutputContract,
} from '@genfeedai/contracts/interfaces/billing';
import type {
  ExecutableNode,
  ExecutionContext,
} from '@genfeedai/workflows/engine';
import { getExecutableNodeOperationId } from '@genfeedai/workflows/engine';
import { Injectable } from '@nestjs/common';

export interface WorkflowMediaAllocationInput {
  node: ExecutableNode;
  inputs: ReadonlyMap<string, unknown>;
  context: ExecutionContext;
  executionId: string;
}
/** Funding and graph context must come from the authoritative tenant-scoped execution row. */
export interface WorkflowMediaDispatchInput
  extends WorkflowMediaAllocationInput {
  funding: WorkflowExecutionGenerationBilling;
  operationId: string;
  context: ExecutionContext & { executionId: string };
}
export interface PreparedWorkflowMediaAllocation {
  allocation: WorkflowGenerationNodeAllocation;
  prepared: WorkflowMediaProviderPlan;
}
export interface ValidatedWorkflowMediaDispatch {
  executionId: string;
  operationId: string;
  manifestHash: string;
  prepared: WorkflowMediaProviderPlan;
  credential?: ResolvedByokCredential;
  dispatchFingerprint: string;
}
function unavailable(detail: string): never {
  throw new BusinessLogicException(detail);
}
function preparationContract(
  prepared: WorkflowMediaProviderPlan,
  output: WorkflowReviewedOutputContract,
): WorkflowMediaPreparationContract {
  const brief = prepared.generationBriefEvidence;
  if (
    brief.status !== 'compiled' ||
    brief.modelKey !== prepared.model ||
    output.modelKey !== prepared.model ||
    output.provider !== prepared.provider ||
    quoteSnapshotHash(output.target) !== quoteSnapshotHash(prepared.target)
  )
    unavailable(
      'Workflow preparation model or reviewed output identity is unresolved',
    );
  return {
    version: 1,
    preparationVersion: prepared.preparationVersion,
    actionId: prepared.actionId,
    brief: {
      briefVersion: brief.briefVersion,
      compilerId: brief.compilerId,
      compilerVersion: brief.compilerVersion,
      profileId: brief.profileId,
      profileVersion: brief.profileVersion,
      modelKey: brief.modelKey,
      mediaKind: brief.mediaKind,
    },
    reviewedOutput: output,
  };
}

/** Server-owned single-operation compiler. It cannot create holds, outputs, continuations or provider jobs. */
@Injectable()
export class WorkflowMediaBillingPlanService {
  constructor(
    private readonly preparation: WorkflowMediaProviderPlanService,
    private readonly credentials: WorkflowMediaCredentialRouteService,
    private readonly prisma: PrismaService,
    private readonly quotes: ModelCreditQuoteService,
  ) {}

  async prepareAllocation(
    args: WorkflowMediaAllocationInput,
  ): Promise<PreparedWorkflowMediaAllocation> {
    const prepared = await this.preparation.prepareNode(
      args.node,
      args.inputs,
      args.context,
    );
    if (
      prepared.generationBriefEvidence.status !== 'compiled' ||
      prepared.generationBriefEvidence.modelKey !== prepared.model
    )
      unavailable('Workflow generation brief contract is unresolved');
    const projection = projectWorkflowMediaProviderInput(prepared.input);
    const output =
      prepared.provider === 'fal'
        ? { status: 'reviewed' as const, contract: prepared.reviewedOutput }
        : await findReviewedReplicateOutputContract(
            this.prisma,
            prepared.model,
            prepared.input,
            args.context.organizationId,
          );
    if (output.status === 'unresolved')
      unavailable(
        `Workflow provider output contract is unresolved: ${output.reason}`,
      );
    const contract = preparationContract(prepared, output.contract);
    const route = await this.credentials.prepareRoute(
      args.context.organizationId,
      prepared.provider === 'fal' ? ByokProvider.FAL : ByokProvider.REPLICATE,
    );
    const quote =
      route.kind === 'platform'
        ? await this.quotes.quoteSnapshotByKey(prepared.model, {
            ...projection.dimensions,
            ...(prepared.provider === 'fal' ? prepared.referenceQuoteEvidence : {}),
            requests: 1,
            outputs: 1,
            provider: prepared.provider,
            providerInput: prepared.input,
            organizationId: args.context.organizationId,
          })
        : undefined;
    if (quote)
      assertWorkflowMediaPricingUnits(quote.pricingProfile, quote.quantities);
    const dispatch: WorkflowGenerationDispatch = {
      contractVersion: `workflow-media-v1:${quoteSnapshotHash(contract)}`,
      preparationContract: contract,
      projectionPolicy:
        route.kind === 'platform'
          ? { kind: 'frozen-pricing-profile', version: 1 }
          : {
              kind: 'exact-provider-input',
              version: 1,
              inputKeys: projection.inputKeys,
              inputFingerprint: projection.inputFingerprint,
            },
      provider: prepared.provider,
      modelKey: prepared.model,
      target: JSON.stringify(prepared.target),
      credentialRoute: route,
      quantities: quote
        ? { ...quote.quantities, requests: 1, outputs: 1 }
        : { ...projection.dimensions, requests: 1, outputs: 1 },
      billableFingerprint: '',
    };
    dispatch.billableFingerprint = quoteSnapshotHash({
      ...dispatch,
      billableFingerprint: undefined,
    });
    const allocation = workflowGenerationNodeAllocationSchema.parse({
      nodeId: args.node.id,
      actionId: prepared.actionId,
      operationId: workflowGenerationOperationId(
        args.executionId,
        args.node.id,
        prepared.actionId,
      ),
      owner: 'workflow-execution',
      billingMode: route.kind === 'platform' ? 'credits' : 'byok',
      dispatch,
      ...(quote ? { quote } : {}),
    });
    return { allocation, prepared };
  }

  async validateDispatch(
    args: WorkflowMediaDispatchInput,
  ): Promise<ValidatedWorkflowMediaDispatch> {
    const funding = workflowExecutionGenerationBillingSchema.parse(
      args.funding,
    );
    assertWorkflowFundingIdentity(funding);
    const manifest = funding.manifest;
    if (
      manifest.executionId !== args.executionId ||
      manifest.executionId !== args.context.executionId ||
      manifest.organizationId !== args.context.organizationId ||
      manifest.actorUserId !== args.context.userId ||
      manifest.workflowVersionId !== args.context.workflowVersionId ||
      !manifest.selectedNodeIds.includes(args.node.id)
    )
      unavailable('Workflow dispatch differs from its frozen execution owner');
    const frozen = manifest.allocations.find(
      (allocation) => allocation.operationId === args.operationId,
    );
    if (
      !frozen ||
      frozen.nodeId !== args.node.id ||
      frozen.operationId !==
        workflowGenerationOperationId(
          manifest.executionId,
          args.node.id,
          frozen.actionId,
        ) ||
      getExecutableNodeOperationId(args.node) !== frozen.actionId
    )
      unavailable('Workflow operation differs from its frozen execution');
    const prepared = await this.preparation.prepareNode(
      args.node,
      args.inputs,
      args.context,
    );
    if (
      prepared.output.organizationId !== manifest.organizationId ||
      prepared.output.userId !== manifest.actorUserId
    )
      unavailable('Workflow prepared output differs from its frozen owner');
    const contract = preparationContract(
      prepared,
      frozen.dispatch.preparationContract.reviewedOutput,
    );
    if (
      quoteSnapshotHash(contract) !==
      quoteSnapshotHash(frozen.dispatch.preparationContract)
    )
      unavailable('Workflow generation compiler or output contract changed');
    const adapter = contract.reviewedOutput.output;
    if (
      'countInput' in adapter &&
      adapter.countInput &&
      (!Object.hasOwn(prepared.input, adapter.countInput) ||
        prepared.input[adapter.countInput] !== 1)
    )
      unavailable(
        'Workflow final output count differs from its reviewed contract',
      );
    const projection = projectWorkflowMediaProviderInput(prepared.input);
    let quantities: WorkflowGenerationDispatch['quantities'];
    if (frozen.dispatch.projectionPolicy.kind === 'frozen-pricing-profile') {
      if (!frozen.quote) unavailable('Workflow frozen pricing is missing');
      const {
        modelKey: _modelKey,
        provider: _provider,
        ...actual
      } = normalizeModelProviderQuoteRequest(
        frozen.quote.pricingProfile,
        prepared.model,
        {
          ...projection.dimensions,
          ...(prepared.provider === 'fal' ? prepared.referenceQuoteEvidence : {}),
          requests: 1,
          outputs: 1,
          provider: prepared.provider,
          providerInput: prepared.input,
        },
      );
      quantities = { ...actual, requests: 1, outputs: 1 };
      assertWorkflowMediaPricingUnits(frozen.quote.pricingProfile, quantities);
    } else {
      const policy = frozen.dispatch.projectionPolicy;
      if (
        quoteSnapshotHash(projection.inputKeys) !==
          quoteSnapshotHash(policy.inputKeys) ||
        projection.inputFingerprint !== policy.inputFingerprint
      )
        unavailable('Workflow BYOK final provider input changed');
      quantities = { ...projection.dimensions, requests: 1, outputs: 1 };
    }
    if (
      quoteSnapshotHash(quantities) !==
      quoteSnapshotHash(frozen.dispatch.quantities)
    )
      unavailable('Workflow final billable quantities changed');
    const credential = await this.credentials.resolvePinnedCredential(
      args.context.organizationId,
      prepared.provider === 'fal' ? ByokProvider.FAL : ByokProvider.REPLICATE,
      frozen.dispatch.credentialRoute,
    );
    return {
      executionId: manifest.executionId,
      operationId: frozen.operationId,
      manifestHash: funding.manifestHash,
      prepared,
      credential,
      dispatchFingerprint: frozen.dispatch.billableFingerprint,
    };
  }
}
