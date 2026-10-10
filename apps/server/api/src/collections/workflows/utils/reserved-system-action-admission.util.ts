import type {
  WorkflowInputVariable,
  WorkflowVersionGraph,
} from '@api/collections/workflows/schemas/workflow.schema';
import {
  getSystemWorkflowMetadata,
  isHiddenSystemWorkflowMetadata,
  SYSTEM_WORKFLOW_PRINCIPAL_ID,
} from '@api/collections/workflows/system-workflow.contract';
import type { SystemWorkflowGraphDefinition } from '@api/collections/workflows/system-workflow-definition';
import { buildWorkflowVersionDefinition } from '@api/collections/workflows/workflow-version-definition';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { readRecord } from '@genfeedai/utils/data/extract.util';
import type { ExecutionContext } from '@genfeedai/workflows/engine';

/** Reserved Clip orchestration is not a tenant workflow action, even with copied metadata. */
export async function assertReservedSystemActionAdmission(
  prisma: PrismaService,
  definitions: ReadonlyMap<string, SystemWorkflowGraphDefinition>,
  input: { actionId: string; nodeId: string; context: ExecutionContext },
): Promise<void> {
  if (!input.actionId.startsWith('clip.')) return;
  const context = input.context;
  const execution = context.executionId
    ? await prisma.workflowExecution.findFirst({
        select: {
          workflowVersion: {
            select: {
              id: true,
              workflowId: true,
              organizationId: true,
              userId: true,
              contentHash: true,
              graph: true,
              inputSchema: true,
              workflow: {
                select: {
                  metadata: true,
                  organizationId: true,
                  userId: true,
                  isDeleted: true,
                },
              },
            },
          },
        },
        where: {
          id: context.executionId,
          organizationId: context.organizationId,
          userId: context.userId,
          workflowId: context.workflowId,
          workflowVersionId: context.workflowVersionId,
          isDeleted: false,
        },
      })
    : null;
  const version = execution?.workflowVersion;
  const mirror = version?.workflow;
  const metadata = mirror
    ? getSystemWorkflowMetadata(mirror.metadata)
    : undefined;
  const definition = metadata
    ? definitions.get(metadata.canonicalId)
    : undefined;
  if (
    !version ||
    !mirror ||
    mirror.isDeleted ||
    !isHiddenSystemWorkflowMetadata(mirror.metadata) ||
    version.organizationId !== SYSTEM_WORKFLOW_PRINCIPAL_ID ||
    version.userId !== SYSTEM_WORKFLOW_PRINCIPAL_ID ||
    mirror.organizationId !== SYSTEM_WORKFLOW_PRINCIPAL_ID ||
    mirror.userId !== SYSTEM_WORKFLOW_PRINCIPAL_ID ||
    !definition ||
    !definition.definition.nodes.some(
      (node) =>
        node.id === input.nodeId &&
        readRecord(node.data?.config).actionId === input.actionId,
    )
  )
    throw new Error('Reserved Clip action requires its registered execution');
  const expected = buildWorkflowVersionDefinition(definition.definition);
  const actual = buildWorkflowVersionDefinition({
    ...(version.graph as unknown as WorkflowVersionGraph),
    inputVariables: version.inputSchema as unknown as WorkflowInputVariable[],
  });
  if (
    version.contentHash !== expected.contentHash ||
    actual.contentHash !== expected.contentHash
  )
    throw new Error(
      'Reserved Clip execution differs from its registered definition',
    );
}
