import type {
  WorkflowDocument,
  WorkflowEdge,
  WorkflowInputVariable,
  WorkflowStep,
  WorkflowVisualNode,
} from '@api/collections/workflows/schemas/workflow.schema';
import {
  EVENT_TYPE_TO_NODE_TYPE,
  EXECUTABLE_WORKFLOW_SELECT,
  VISUAL_TRIGGER_NODE_TYPE_TO_EXECUTOR,
} from '@api/collections/workflows/services/workflow-executor.constants';
import type { TriggerEvent } from '@api/collections/workflows/services/workflow-executor.types';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { WorkflowLifecycle, WorkflowStatus } from '@genfeedai/enums';

export class WorkflowExecutorDocumentService {
  constructor(private readonly prisma: PrismaService) {}

  async findMatchingWorkflows(
    event: TriggerEvent,
  ): Promise<WorkflowDocument[]> {
    const executorNodeType = EVENT_TYPE_TO_NODE_TYPE[event.type] ?? event.type;
    const workflows = await this.prisma.workflow.findMany({
      select: EXECUTABLE_WORKFLOW_SELECT,
      where: {
        isDeleted: false,
        lifecycle: WorkflowLifecycle.PUBLISHED,
        organizationId: event.organizationId,
        status: WorkflowStatus.ACTIVE,
      },
    });
    const normalizedWorkflows = workflows.map((workflow) =>
      this.normalizeWorkflowDocument(workflow),
    );

    return normalizedWorkflows.filter((workflow) => {
      if (!workflow.nodes || workflow.nodes.length === 0) {
        return false;
      }

      return workflow.nodes.some((node) => {
        const nodeExecutorType = this.resolveNodeType(node.type);
        if (nodeExecutorType !== executorNodeType) {
          return false;
        }

        const nodePlatform = node.data?.config?.platform as string | undefined;
        return !nodePlatform || nodePlatform === event.platform;
      });
    });
  }

  normalizeWorkflowDocument(workflow: unknown): WorkflowDocument {
    const workflowRecord = workflow as Record<string, unknown>;

    return {
      ...(workflowRecord as unknown as WorkflowDocument),
      _id: String(workflowRecord.mongoId ?? workflowRecord.id ?? ''),
      config: this.readObjectRecord(workflowRecord.config) ?? undefined,
      edges: this.readArray<WorkflowEdge>(workflowRecord.edges),
      inputVariables: this.readArray<WorkflowInputVariable>(
        workflowRecord.inputVariables,
      ),
      metadata: this.readObjectRecord(workflowRecord.metadata) ?? undefined,
      nodes: this.readArray<WorkflowVisualNode>(workflowRecord.nodes),
      organization: (workflowRecord.organizationId ??
        workflowRecord.organization) as string | undefined,
      steps: this.readArray<WorkflowStep>(workflowRecord.steps),
      user: (workflowRecord.userId ?? workflowRecord.user) as
        | string
        | undefined,
    };
  }

  getWorkflowLabel(workflow: Pick<WorkflowDocument, 'label'>): string {
    return typeof workflow.label === 'string' && workflow.label.length > 0
      ? workflow.label
      : 'Workflow';
  }

  private resolveNodeType(visualNodeType: string): string {
    return (
      VISUAL_TRIGGER_NODE_TYPE_TO_EXECUTOR[visualNodeType] ?? visualNodeType
    );
  }

  private readArray<T>(value: unknown): T[] {
    return Array.isArray(value) ? (value as T[]) : [];
  }

  private readObjectRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    return value as Record<string, unknown>;
  }
}
