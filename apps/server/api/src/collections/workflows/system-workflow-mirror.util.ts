import {
  buildHiddenSystemWorkflowMetadata,
  HIDDEN_SYSTEM_WORKFLOW_SOURCE_TYPE,
  isHiddenSystemWorkflowMetadata,
  SYSTEM_WORKFLOW_METADATA_KEY,
  SYSTEM_WORKFLOW_PRINCIPAL_ID,
  SYSTEM_WORKFLOW_TEMPLATE_CHANGE_SUMMARY,
  SYSTEM_WORKFLOW_TEMPLATE_VERSION,
} from '@api/collections/workflows/system-workflow.contract';
import type { SystemWorkflowGraphDefinition } from '@api/collections/workflows/system-workflow-runner.service';
import { runSerializableWithRetry } from '@api/collections/workflows/utils/serializable-retry.util';
import {
  buildWorkflowVersionDefinition,
  createVersionedWorkflow,
} from '@api/collections/workflows/workflow-version-definition';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { WorkflowStatus } from '@genfeedai/contracts';
import { type Prisma, toPrismaJson } from '@genfeedai/prisma';
import { crossOrgUnsafe } from '@libs/prisma/tenant-context';

export async function ensureHiddenSystemWorkflowMirror(
  prisma: PrismaService,
  definition: SystemWorkflowGraphDefinition,
): Promise<Prisma.WorkflowGetPayload<{ include: { currentVersion: true } }>> {
  const where = {
    isDeleted: false,
    metadata: {
      equals: definition.canonicalId,
      path: [SYSTEM_WORKFLOW_METADATA_KEY, 'canonicalId'],
    },
    organizationId: SYSTEM_WORKFLOW_PRINCIPAL_ID,
    userId: SYSTEM_WORKFLOW_PRINCIPAL_ID,
  } satisfies Prisma.WorkflowWhereInput;
  // Hidden system workflows are platform-global rows owned by the system
  // principal, not by the request tenant, so this mirror runs as an explicit
  // cross-org operation inside the request's tenant context (#5981).
  return crossOrgUnsafe(
    async () =>
      await runSerializableWithRetry(prisma, async (transaction) => {
        await transaction.$executeRaw`
        SELECT pg_advisory_xact_lock(
          hashtextextended(${`hidden-system-workflow:${definition.canonicalId}`}, 0)
        )
      `;
        const existing = await transaction.workflow.findFirst({
          include: { currentVersion: true },
          where,
        });
        if (existing) {
          if (!isHiddenSystemWorkflowMetadata(existing.metadata)) {
            throw new Error(
              `System workflow ${definition.canonicalId} collides with a non-hidden principal workflow`,
            );
          }
          const nextDefinition = buildWorkflowVersionDefinition(
            definition.definition,
          );
          const currentVersion = existing.currentVersion;
          if (!currentVersion) {
            throw new Error(
              `System workflow ${definition.canonicalId} has no immutable version pin`,
            );
          }
          const mirrorMetadata = buildHiddenMirrorMetadata(definition);
          if (currentVersion.contentHash === nextDefinition.contentHash) {
            return transaction.workflow.update({
              data: {
                description: definition.description,
                label: definition.label,
                metadata: mirrorMetadata as Prisma.InputJsonValue,
                schedule: definition.schedule,
              },
              include: { currentVersion: true },
              where: { id: existing.id },
            });
          }

          const nextVersion = await transaction.workflowVersion.create({
            data: {
              contentHash: nextDefinition.contentHash,
              graph: toPrismaJson(nextDefinition.graph),
              inputSchema: toPrismaJson(nextDefinition.inputSchema),
              organizationId: SYSTEM_WORKFLOW_PRINCIPAL_ID,
              userId: SYSTEM_WORKFLOW_PRINCIPAL_ID,
              version: currentVersion.version + 1,
              workflowId: existing.id,
            },
          });
          // sql-risk-audit: ignore bulk-write-tenant-review -- hidden system workflows are platform-global (SYSTEM_WORKFLOW_PRINCIPAL_ID); currentVersionId is the concurrency token.
          const advanced = await transaction.workflow.updateMany({
            data: {
              currentVersionId: nextVersion.id,
              description: definition.description,
              label: definition.label,
              metadata: mirrorMetadata as Prisma.InputJsonValue,
              schedule: definition.schedule,
            },
            where: {
              currentVersionId: existing.currentVersionId,
              id: existing.id,
            },
          });
          if (advanced.count !== 1) {
            throw new Error(
              `System workflow ${definition.canonicalId} changed concurrently`,
            );
          }
          return transaction.workflow.findUniqueOrThrow({
            include: { currentVersion: true },
            where: { id: existing.id },
          });
        }

        return createVersionedWorkflow(
          transaction,
          {
            description: definition.description,
            executionCount: 0,
            isDeleted: false,
            isScheduleEnabled: false,
            label: definition.label,
            metadata: buildHiddenMirrorMetadata(
              definition,
            ) as Prisma.InputJsonValue,
            organizationId: SYSTEM_WORKFLOW_PRINCIPAL_ID,
            progress: 0,
            schedule: definition.schedule,
            status: WorkflowStatus.ACTIVE,
            timezone: 'UTC',
            userId: SYSTEM_WORKFLOW_PRINCIPAL_ID,
          },
          definition.definition,
        );
      }),
  );
}

function buildHiddenMirrorMetadata(
  definition: SystemWorkflowGraphDefinition,
): Record<string, unknown> {
  return {
    sourceTemplateChangeSummary:
      definition.changeSummary ?? SYSTEM_WORKFLOW_TEMPLATE_CHANGE_SUMMARY,
    sourceTemplateId: definition.canonicalId,
    sourceTemplateVersion:
      definition.version ?? SYSTEM_WORKFLOW_TEMPLATE_VERSION,
    sourceType: HIDDEN_SYSTEM_WORKFLOW_SOURCE_TYPE,
    [SYSTEM_WORKFLOW_METADATA_KEY]: buildHiddenSystemWorkflowMetadata({
      canonicalId: definition.canonicalId,
      changeSummary: definition.changeSummary,
      version: definition.version,
    }),
  };
}
