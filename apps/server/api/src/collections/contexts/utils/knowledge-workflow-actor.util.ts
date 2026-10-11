import type { BrandAccessService } from '@api/authorization/brand-access/brand-access.service';
import {
  type HiddenWorkflowRule,
  hiddenExecutionRef,
  validateHiddenExecutionChain,
} from '@api/authorization/brand-access/hidden-execution-chain.util';
import {
  parseWorkflowActor,
  refreshWorkflowActor,
  toWorkflowActor,
  workflowActorKey,
} from '@api/authorization/brand-access/workflow-actor.util';
import type { KnowledgeActor } from '@api/collections/contexts/interfaces/knowledge-actor.interface';
import { KNOWLEDGE_SOURCE_WORKFLOW_IDS } from '@api/collections/contexts/services/knowledge-source-ingest-workflow-definition';
import type { SystemWorkflowActionRequest } from '@api/collections/workflows/system-workflow-runner.service';
import type { WorkflowSchedulePrincipal } from '@api/collections/workflows/utils/workflow-schedule-actor.util';
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
/**
 * The authenticated principal that configures a Knowledge refresh schedule.
 * Copies only the identity fields of an actor resolved from the request, so
 * brand scope, role or workflow scope never reach the persisted binding.
 */
export function toKnowledgeSchedulePrincipal(
  actor: KnowledgeActor,
): WorkflowSchedulePrincipal {
  return {
    apiKeyId: actor.apiKeyId,
    isApiKey: actor.isApiKey ?? false,
    organizationId: actor.organizationId,
    scopes: actor.scopes ?? [],
    userId: actor.userId,
  };
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

const KNOWLEDGE_BACKFILL_RULE: HiddenWorkflowRule = {
  accepts: (holder, organizationId) => holder.organizationId === organizationId,
  holderKey: 'request',
  matches: (canonicalId) =>
    canonicalId === KNOWLEDGE_SOURCE_WORKFLOW_IDS.BACKFILL,
  rootSources: ['knowledge-source-backfill'],
};
const KNOWLEDGE_INGEST_RULE: HiddenWorkflowRule = {
  accepts: (holder, organizationId) =>
    holder.organizationId === organizationId &&
    nonempty(holder.sourceId) &&
    nonempty(holder.versionId),
  holderKey: 'request',
  matches: (canonicalId) =>
    canonicalId === KNOWLEDGE_SOURCE_WORKFLOW_IDS.INGEST,
  parents: [
    {
      discovery: {
        itemsKey: 'items',
        matches: (item, holder) =>
          item.organizationId === holder.organizationId &&
          item.sourceId === holder.sourceId &&
          item.versionId === holder.versionId,
        nodeId: 'discover-sources',
      },
      nodeId: (nodeId) => nodeId === 'ingest-sources',
      rule: KNOWLEDGE_BACKFILL_RULE,
    },
  ],
  rootSources: ['knowledge-source'],
};

/** Read authority only from the server-persisted, pinned hidden execution. */
export async function validateKnowledgeWorkflowAction(
  tx: Prisma.TransactionClient,
  policy: BrandAccessService,
  action: SystemWorkflowActionRequest,
  canonicalId: string,
  incoming: unknown,
): Promise<KnowledgeSourceIngestWorkflowInput> {
  const { context, provenance } = action;
  const rule =
    canonicalId === KNOWLEDGE_SOURCE_WORKFLOW_IDS.INGEST
      ? KNOWLEDGE_INGEST_RULE
      : canonicalId === KNOWLEDGE_SOURCE_WORKFLOW_IDS.BACKFILL
        ? KNOWLEDGE_BACKFILL_RULE
        : denyKnowledgeWork();
  const { actor: captured, holder: persisted } =
    await validateHiddenExecutionChain(
      tx,
      hiddenExecutionRef(context, provenance, denyKnowledgeWork),
      rule,
      { deny: denyKnowledgeWork },
    );
  const supplied = record(incoming);
  if (
    supplied.organizationId !== persisted.organizationId ||
    (canonicalId === KNOWLEDGE_SOURCE_WORKFLOW_IDS.INGEST &&
      (supplied.sourceId !== persisted.sourceId ||
        supplied.versionId !== persisted.versionId))
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
