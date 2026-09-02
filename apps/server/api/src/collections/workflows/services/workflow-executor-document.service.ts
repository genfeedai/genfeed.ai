import type {
  WorkflowDocument,
  WorkflowVisualNode,
} from '@api/collections/workflows/schemas/workflow.schema';
import {
  EVENT_TYPE_TO_NODE_TYPE,
  EXECUTABLE_WORKFLOW_IDENTITY_SELECT,
  EXECUTABLE_WORKFLOW_SELECT,
  VISUAL_TRIGGER_NODE_TYPE_TO_EXECUTOR,
} from '@api/collections/workflows/services/workflow-executor.constants';
import type { TriggerEvent } from '@api/collections/workflows/services/workflow-executor.types';
import {
  isHiddenSystemWorkflowMetadata,
  SYSTEM_WORKFLOW_PRINCIPAL_ID,
} from '@api/collections/workflows/system-workflow.contract';
import { hydrateWorkflowDefinition } from '@api/collections/workflows/workflow-version-definition';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { WorkflowLifecycle, WorkflowStatus } from '@genfeedai/enums';

export class RetiredWorkflowExecutionError extends Error {
  constructor(workflowId: string, workflowVersionId: string) {
    super(
      `Workflow ${workflowId} is retired and cannot resume pinned version ${workflowVersionId}`,
    );
    this.name = 'RetiredWorkflowExecutionError';
  }
}

export class WorkflowExecutorDocumentService {
  constructor(private readonly prisma: PrismaService) {}

  async findMatchingWorkflows(
    event: TriggerEvent,
  ): Promise<WorkflowDocument[]> {
    const executorNodeType = EVENT_TYPE_TO_NODE_TYPE[event.type] ?? event.type;
    const workflows = await this.prisma.workflow.findMany({
      select: EXECUTABLE_WORKFLOW_SELECT,
      where: scopedWhere(event.organizationId, {
        lifecycle: WorkflowLifecycle.PUBLISHED,
        status: WorkflowStatus.ACTIVE,
      }),
    });
    const normalizedWorkflows = workflows.map((workflow) =>
      this.normalizeWorkflowDocument(workflow),
    );

    return normalizedWorkflows.filter((workflow) => {
      if (!workflow.nodes || workflow.nodes.length === 0) {
        return false;
      }

      return workflow.nodes.some((node) => {
        return this.doesTriggerNodeMatchEvent(node, executorNodeType, event);
      });
    });
  }

  async findPinnedWorkflow(
    workflowId: string,
    workflowVersionId: string,
    organizationId: string,
    actorUserId: string,
  ): Promise<WorkflowDocument | null> {
    // tenant-scope-ignore: immutable version/workflow IDs are globally unique; the loaded owner tuple is checked below before tenant projection, and only the fixed-principal hidden mirror may cross the tenant boundary
    const version = await this.prisma.workflowVersion.findFirst({
      select: {
        graph: true,
        id: true,
        inputSchema: true,
        organizationId: true,
        userId: true,
        version: true,
        workflow: { select: EXECUTABLE_WORKFLOW_IDENTITY_SELECT },
      },
      where: {
        id: workflowVersionId,
        workflowId,
      },
    });
    if (!version) {
      return null;
    }

    const isTenantOwned =
      version.organizationId === organizationId &&
      version.organizationId === version.workflow.organizationId &&
      version.userId === version.workflow.userId;
    if (isTenantOwned) {
      this.assertWorkflowIsExecutable(
        version.workflow.isDeleted,
        workflowId,
        workflowVersionId,
      );
      return this.normalizeWorkflowDocument({
        ...version.workflow,
        currentVersion: version,
      });
    }

    const isGlobalHiddenMirror =
      version.organizationId === SYSTEM_WORKFLOW_PRINCIPAL_ID &&
      version.userId === SYSTEM_WORKFLOW_PRINCIPAL_ID &&
      version.workflow.organizationId === SYSTEM_WORKFLOW_PRINCIPAL_ID &&
      version.workflow.userId === SYSTEM_WORKFLOW_PRINCIPAL_ID &&
      isHiddenSystemWorkflowMetadata(version.workflow.metadata);
    if (!isGlobalHiddenMirror) {
      return null;
    }
    this.assertWorkflowIsExecutable(
      version.workflow.isDeleted,
      workflowId,
      workflowVersionId,
    );

    return this.normalizeWorkflowDocument({
      ...version.workflow,
      currentVersion: version,
      organizationId,
      userId: actorUserId,
    });
  }

  normalizeWorkflowDocument(workflow: unknown): WorkflowDocument {
    const workflowRecord = workflow as Record<string, unknown>;
    return hydrateWorkflowDefinition({
      ...workflowRecord,
      config: this.readObjectRecord(workflowRecord.config) ?? undefined,
      metadata: this.readObjectRecord(workflowRecord.metadata) ?? undefined,
    });
  }

  getWorkflowLabel(workflow: Pick<WorkflowDocument, 'label'>): string {
    return typeof workflow.label === 'string' && workflow.label.length > 0
      ? workflow.label
      : 'Workflow';
  }

  private assertWorkflowIsExecutable(
    isDeleted: boolean,
    workflowId: string,
    workflowVersionId: string,
  ): void {
    if (isDeleted) {
      throw new RetiredWorkflowExecutionError(workflowId, workflowVersionId);
    }
  }

  private resolveNodeType(visualNodeType: string): string {
    return (
      VISUAL_TRIGGER_NODE_TYPE_TO_EXECUTOR[visualNodeType] ?? visualNodeType
    );
  }

  private doesTriggerNodeMatchEvent(
    node: WorkflowVisualNode,
    executorNodeType: string,
    event: TriggerEvent,
  ): boolean {
    const nodeExecutorType = this.resolveNodeType(node.type);
    if (nodeExecutorType !== executorNodeType) {
      return false;
    }

    const config = this.readNodeConfig(node);
    if (config.enabled === false || config.isEnabled === false) {
      return false;
    }

    const nodePlatform = this.optionalString(config.platform);
    if (nodePlatform && nodePlatform !== event.platform) {
      return false;
    }

    if (nodeExecutorType === 'commentTrigger') {
      return this.doesCommentTriggerRuleMatch(config, event);
    }

    return true;
  }

  private doesCommentTriggerRuleMatch(
    config: Record<string, unknown>,
    event: TriggerEvent,
  ): boolean {
    const data = this.readObjectRecord(event.data) ?? {};

    if (!this.matchesOptionalString(config.brandId, data.brandId)) {
      return false;
    }

    if (
      !this.matchesOptionalString(config.conversationId, data.conversationId)
    ) {
      return false;
    }

    if (!this.matchesOptionalString(config.credentialId, data.credentialId)) {
      return false;
    }

    const contentIds = this.readStringList(
      config.contentIds ?? config.videoIds ?? config.postIds,
    );
    if (
      contentIds.length > 0 &&
      !this.hasIntersection(
        contentIds,
        this.readStringList([
          data.sourceContentId,
          data.contentId,
          data.videoId,
          data.postId,
        ]),
      )
    ) {
      return false;
    }

    const text = this.optionalString(data.text)?.toLowerCase() ?? '';
    const excludedKeywords = this.readStringList(config.excludeKeywords);
    if (
      excludedKeywords.length > 0 &&
      excludedKeywords.some((keyword) => text.includes(keyword.toLowerCase()))
    ) {
      return false;
    }

    const keywords = this.readStringList(config.keywords);
    if (
      keywords.length > 0 &&
      !keywords.some((keyword) => text.includes(keyword.toLowerCase()))
    ) {
      return false;
    }

    return true;
  }

  private readNodeConfig(node: WorkflowVisualNode): Record<string, unknown> {
    const visualConfig = this.readObjectRecord(node.data?.config);
    if (visualConfig) {
      return visualConfig;
    }

    const executableConfig = this.readObjectRecord(
      (node as unknown as { config?: unknown }).config,
    );
    return executableConfig ?? {};
  }

  private matchesOptionalString(expected: unknown, actual: unknown): boolean {
    const expectedValue = this.optionalString(expected);
    if (!expectedValue) {
      return true;
    }

    return expectedValue === this.optionalString(actual);
  }

  private hasIntersection(left: string[], right: string[]): boolean {
    const rightValues = new Set(right);
    return left.some((value) => rightValues.has(value));
  }

  private readStringList(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value
        .flatMap((item) => this.readStringList(item))
        .filter((item, index, all) => all.indexOf(item) === index);
    }

    if (typeof value === 'string') {
      return value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    }

    return [];
  }

  private optionalString(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }

  private readObjectRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    return value as Record<string, unknown>;
  }
}
