import type { BrandAccessService } from '@api/authorization/brand-access/brand-access.service';
import {
  parseWorkflowActor,
  refreshWorkflowActor,
  toWorkflowActor,
  workflowActorKey,
} from '@api/authorization/brand-access/workflow-actor.util';
import type { KnowledgeActor } from '@api/collections/contexts/interfaces/knowledge-actor.interface';
import { KNOWLEDGE_SOURCE_WORKFLOW_IDS } from '@api/collections/contexts/services/knowledge-source-ingest-workflow-definition';
import {
  getSystemWorkflowMetadata,
  isHiddenSystemWorkflowMetadata,
  SYSTEM_WORKFLOW_PRINCIPAL_ID,
} from '@api/collections/workflows/system-workflow.contract';
import type { SystemWorkflowActionRequest } from '@api/collections/workflows/system-workflow-runner.service';
import type {
  KnowledgeSourceIngestWorkflowInput,
  KnowledgeWorkflowInitiatingActor,
} from '@genfeedai/contracts/interfaces/automation/content-delivery-workflow.interface';
import type { Prisma } from '@genfeedai/prisma';
import { ForbiddenException } from '@nestjs/common';

export function denyKnowledgeWork(): never {
  throw new ForbiddenException('Knowledge access denied');
}
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function nonempty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
export function parseKnowledgeWorkflowActor(
  value: unknown,
  organizationId: string,
): KnowledgeWorkflowInitiatingActor {
  return parseWorkflowActor(value, organizationId, denyKnowledgeWork);
}
export function toKnowledgeWorkflowActor(
  actor: KnowledgeActor,
): KnowledgeWorkflowInitiatingActor {
  return toWorkflowActor(actor, denyKnowledgeWork);
}
export function knowledgeWorkflowActorKey(
  actor: KnowledgeWorkflowInitiatingActor,
): string {
  return workflowActorKey(actor, denyKnowledgeWork);
}
export function refreshKnowledgeWorkflowActor(
  tx: Prisma.TransactionClient,
  policy: BrandAccessService,
  value: unknown,
  organizationId: string,
): Promise<KnowledgeWorkflowInitiatingActor | undefined> {
  return refreshWorkflowActor(
    tx,
    policy,
    value,
    organizationId,
    denyKnowledgeWork,
  );
}

/** Read authority only from the server-persisted, pinned hidden execution. */
export async function validateKnowledgeWorkflowAction(
  tx: Prisma.TransactionClient,
  policy: BrandAccessService,
  action: SystemWorkflowActionRequest,
  canonicalId: string,
  incoming: unknown,
): Promise<KnowledgeSourceIngestWorkflowInput> {
  const { context, provenance } = action;
  if (
    !context.organizationId ||
    !context.userId ||
    provenance.executionId !== (context.executionId ?? context.runId) ||
    provenance.workflowId !== context.workflowId
  )
    denyKnowledgeWork();
  const select = {
    id: true,
    organizationId: true,
    userId: true,
    workflowId: true,
    workflowVersionId: true,
    result: true,
    workflow: {
      select: {
        isDeleted: true,
        organizationId: true,
        userId: true,
        metadata: true,
      },
    },
    workflowVersion: {
      select: { workflowId: true, organizationId: true, userId: true },
    },
  } as const;
  const execution = await tx.workflowExecution.findFirst({
    where: {
      id: provenance.executionId,
      organizationId: context.organizationId,
      isDeleted: false,
    },
    select,
  });
  const hidden = (row: NonNullable<typeof execution>, expected: string) =>
    !row.workflow.isDeleted &&
    row.workflow.organizationId === SYSTEM_WORKFLOW_PRINCIPAL_ID &&
    row.workflow.userId === SYSTEM_WORKFLOW_PRINCIPAL_ID &&
    row.workflowVersion.organizationId === SYSTEM_WORKFLOW_PRINCIPAL_ID &&
    row.workflowVersion.userId === SYSTEM_WORKFLOW_PRINCIPAL_ID &&
    row.workflowVersion.workflowId === row.workflowId &&
    isHiddenSystemWorkflowMetadata(row.workflow.metadata) &&
    getSystemWorkflowMetadata(row.workflow.metadata)?.canonicalId === expected;
  if (
    !execution ||
    execution.userId !== context.userId ||
    execution.workflowId !== context.workflowId ||
    execution.workflowVersionId !== context.workflowVersionId ||
    !hidden(execution, canonicalId)
  )
    denyKnowledgeWork();
  const result = record(execution.result);
  const metadata = record(result.metadata);
  const persisted = record(record(result.inputValues).request);
  const supplied = record(incoming);
  if (
    persisted.organizationId !== context.organizationId ||
    supplied.organizationId !== persisted.organizationId ||
    (canonicalId === KNOWLEDGE_SOURCE_WORKFLOW_IDS.INGEST &&
      (!nonempty(persisted.sourceId) ||
        !nonempty(persisted.versionId) ||
        supplied.sourceId !== persisted.sourceId ||
        supplied.versionId !== persisted.versionId))
  )
    denyKnowledgeWork();
  const captured = persisted.initiatingActor;
  if (
    captured !== undefined &&
    parseKnowledgeWorkflowActor(captured, context.organizationId).userId !==
      context.userId
  )
    denyKnowledgeWork();
  if (metadata.parentExecutionId !== undefined) {
    if (
      canonicalId !== KNOWLEDGE_SOURCE_WORKFLOW_IDS.INGEST ||
      !nonempty(metadata.parentExecutionId) ||
      metadata.parentNodeId !== 'ingest-sources' ||
      !Number.isInteger(metadata.workflowForEachIndex) ||
      (metadata.workflowForEachIndex as number) < 0
    )
      denyKnowledgeWork();
    const parent = await tx.workflowExecution.findFirst({
      where: {
        id: metadata.parentExecutionId,
        organizationId: context.organizationId,
        isDeleted: false,
      },
      select,
    });
    if (
      !parent ||
      parent.userId !== execution.userId ||
      metadata.parentWorkflowId !== parent.workflowId ||
      !hidden(parent, KNOWLEDGE_SOURCE_WORKFLOW_IDS.BACKFILL)
    )
      denyKnowledgeWork();
    const parentResult = record(parent.result);
    const parentMetadata = record(parentResult.metadata);
    const parentRequest = record(record(parentResult.inputValues).request);
    if (
      parentMetadata.source !== 'knowledge-source-backfill' ||
      parentMetadata.canonicalId !== KNOWLEDGE_SOURCE_WORKFLOW_IDS.BACKFILL ||
      parentRequest.organizationId !== context.organizationId ||
      knowledgeWorkflowActorKey(
        parseKnowledgeWorkflowActor(
          parentRequest.initiatingActor,
          context.organizationId,
        ),
      ) !==
        knowledgeWorkflowActorKey(
          parseKnowledgeWorkflowActor(captured, context.organizationId),
        )
    )
      denyKnowledgeWork();
    const discovered = await tx.workflowExecutionNodeResult.findFirst({
      where: {
        organizationId: context.organizationId,
        executionId: parent.id,
        nodeId: 'discover-sources',
      },
      select: { output: true },
    });
    const items = record(discovered?.output).items;
    const item = record(
      Array.isArray(items)
        ? items[metadata.workflowForEachIndex as number]
        : undefined,
    );
    if (
      item.organizationId !== persisted.organizationId ||
      item.sourceId !== persisted.sourceId ||
      item.versionId !== persisted.versionId ||
      knowledgeWorkflowActorKey(
        parseKnowledgeWorkflowActor(
          item.initiatingActor,
          context.organizationId,
        ),
      ) !==
        knowledgeWorkflowActorKey(
          parseKnowledgeWorkflowActor(captured, context.organizationId),
        )
    )
      denyKnowledgeWork();
  } else if (
    metadata.canonicalId !== canonicalId ||
    metadata.source !==
      (canonicalId === KNOWLEDGE_SOURCE_WORKFLOW_IDS.INGEST
        ? 'knowledge-source'
        : 'knowledge-source-backfill')
  )
    denyKnowledgeWork();
  const initiatingActor = await refreshKnowledgeWorkflowActor(
    tx,
    policy,
    captured,
    context.organizationId,
  );
  return {
    organizationId: context.organizationId,
    sourceId: persisted.sourceId as string,
    versionId: persisted.versionId as string,
    ...(initiatingActor ? { initiatingActor } : {}),
  };
}
