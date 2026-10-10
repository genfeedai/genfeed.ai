import { BrandAccessService } from '@api/authorization/brand-access/brand-access.service';
import { assertWorkflowGenerationActorAdmission } from '@api/collections/workflows/utils/workflow-generation-actor-admission.util';
import { WorkflowGenerationBillingService } from '@api/collections/credits/services/workflow-generation-billing.service';
import { WorkflowExecutionGraphService } from '@api/collections/workflows/services/workflow-execution-graph.service';
import { WorkflowMediaBillingPlanService } from '@api/collections/workflows/services/workflow-media-billing-plan.service';
import { parseWorkflowGenerationAdmissionSource } from '@api/collections/workflows/utils/workflow-generation-admission-source.util';
import type { WorkflowAdmissionAvailableSourceV1 } from '@api/collections/workflows/workflow-generation-admission.interface';
import { BusinessLogicException } from '@api/exceptions/business-logic.exception';
import { quoteSnapshotHash } from '@api/helpers/utils/credits/quote-snapshot.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { WorkflowGenerationNodeAllocation } from '@genfeedai/contracts/interfaces/billing';
import {
  type ExecutableNode,
  getExecutableNodeOperationId,
} from '@genfeedai/workflows/engine';
import { Injectable } from '@nestjs/common';

function unavailable(detail: string): never {
  throw new BusinessLogicException(detail);
}

function mediaActionId(node: ExecutableNode): 'imageGen' | 'videoGen' | null {
  try {
    const actionId = getExecutableNodeOperationId(node);
    return actionId === 'imageGen' || actionId === 'videoGen' ? actionId : null;
  } catch {
    return null;
  }
}

/** Compiles static Replicate image/video allocations from frozen admission source. */
@Injectable()
export class WorkflowGenerationAdmissionPlanService {
  private readonly graph = new WorkflowExecutionGraphService();

  constructor(
    private readonly prisma: PrismaService,
    private readonly billingPlan: WorkflowMediaBillingPlanService,
    private readonly generationBilling: WorkflowGenerationBillingService,
    private readonly brandAccess: BrandAccessService,
  ) {}

  async fundExecution(
    executionId: string,
    organizationId: string,
  ): Promise<void> {
    const execution = await this.prisma.workflowExecution.findFirst({
      select: {
        generationAdmissionSource: true,
        generationBilling: true,
      },
      where: { id: executionId, isDeleted: false, organizationId },
    });
    if (!execution) unavailable('Workflow execution is unavailable');
    if (execution.generationBilling) {
      await this.generationBilling.recoverPreparation(
        executionId,
        organizationId,
      );
      return;
    }
    if (!execution.generationAdmissionSource) return;
    const source = parseWorkflowGenerationAdmissionSource(
      execution.generationAdmissionSource,
    );
    if (source.state === 'redacted')
      unavailable('Workflow admission source is no longer available');
    await assertWorkflowGenerationActorAdmission(this.brandAccess, source, this.prisma);
    const allocations = await this.compileAllocations(executionId, source);
    await this.generationBilling.prepareFunding({
      actorUserId: source.actorUserId,
      allocations,
      executionId,
      graphFingerprint: quoteSnapshotHash({
        edges: source.workflow.edges.filter(
          (edge) =>
            source.selectedNodeIds.includes(edge.source) &&
            source.selectedNodeIds.includes(edge.target),
        ),
        nodes: source.workflow.nodes.filter((node) =>
          source.selectedNodeIds.includes(node.id),
        ),
        selectedNodeIds: source.selectedNodeIds,
      }),
      organizationId: source.organizationId,
      selectedNodeIds: source.selectedNodeIds,
      workflowVersionId: source.workflowVersionId,
    });
  }

  private async compileAllocations(
    executionId: string,
    source: WorkflowAdmissionAvailableSourceV1,
  ): Promise<WorkflowGenerationNodeAllocation[]> {
    const selected = source.workflow.nodes.filter((node) =>
      source.selectedNodeIds.includes(node.id),
    );
    const mediaNodes = selected.filter((node) => mediaActionId(node) !== null);
    const cache = new Map(Object.entries(source.initialNodeOutputs));
    const results = new Map(
      source.initiallyCompletedNodeIds.map((nodeId) => [
        nodeId,
        { status: 'completed' as const },
      ]),
    );
    const allocations: WorkflowGenerationNodeAllocation[] = [];
    for (const node of mediaNodes) {
      const inputs = this.graph.gatherInputs(
        node,
        source.workflow.edges,
        cache,
        results,
      );
      try {
        const prepared = await this.billingPlan.prepareAllocation({
          context: {
            executionId,
            organizationId: source.organizationId,
            runId: executionId,
            userId: source.actorUserId,
            workflowId: source.workflowId,
            workflowVersionId: source.workflowVersionId,
          },
          executionId,
          inputs,
          node,
        });
        allocations.push(prepared.allocation);
      } catch (error: unknown) {
        if (error instanceof BusinessLogicException)
          unavailable(
            `Workflow selected media operations are unresolved: ${node.id}`,
          );
        throw error;
      }
    }
    if (mediaNodes.length > 0 && allocations.length === 0)
      unavailable('Workflow selected media operations are unresolved');
    return allocations;
  }
}
