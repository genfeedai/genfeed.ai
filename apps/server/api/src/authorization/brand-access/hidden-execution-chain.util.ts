import {
  denyWorkflowActor,
  parseWorkflowActor,
  type WorkflowActorDenial,
  workflowActorKey,
} from '@api/authorization/brand-access/workflow-actor.util';
import {
  getSystemWorkflowMetadata,
  isHiddenSystemWorkflowMetadata,
  SYSTEM_WORKFLOW_PRINCIPAL_ID,
} from '@api/collections/workflows/system-workflow.contract';
import { WorkflowExecutionTrigger } from '@genfeedai/contracts';
import type { Prisma } from '@genfeedai/prisma';

/**
 * The execution a pinned hidden system action runs in. Every field comes from the trusted
 * engine context, never from node input.
 */
export type HiddenExecutionRef = {
  executionId: string;
  organizationId: string;
  userId: string;
  workflowId: string;
  /** Required for the executing level; ancestors are pinned through their own version row. */
  workflowVersionId?: string;
};

type HiddenExecutionContext = {
  executionId?: string;
  organizationId?: string;
  runId: string;
  userId?: string;
  workflowId: string;
  workflowVersionId: string;
};

export type HiddenWorkflowRule = {
  /** Extra tenant check on the persisted holder record. */
  accepts?: (
    holder: Record<string, unknown>,
    organizationId: string,
  ) => boolean;
  /** Key under the persisted input values that holds the actor-bearing record; the whole input when omitted. */
  holderKey?: string;
  /** Canonical ids of the hidden system workflow this rule admits. */
  matches: (canonicalId: string) => boolean;
  /** Admitted fan-out parents. Omit when it can only run as a root. */
  parents?: readonly HiddenWorkflowParent[];
  /** Admitted `metadata.source` values when it runs as a root. Omit when it can only run as a child. */
  rootSources?: readonly string[];
};

export type HiddenWorkflowParent =
  | {
      kind?: 'hidden';
      /** The parent's own persisted discovery output must contain this child's item. */
      discovery?: {
        itemsKey: string;
        matches: (
          item: Record<string, unknown>,
          holder: Record<string, unknown>,
        ) => boolean;
        nodeId: string;
      };
      nodeId: (nodeId: string) => boolean;
      rule: HiddenWorkflowRule;
    }
  | {
      /**
       * A tenant-owned scheduled workflow whose server-written schedule binding is the
       * actor. Manual or API runs of the same workflow carry no actor.
       */
      kind: 'scheduled-tenant';
    };

export type HiddenChainOptions = {
  /** Compare the persisted actor to the execution user. True for queued hidden roots. */
  bindActorToExecutionUser?: boolean;
  deny?: WorkflowActorDenial;
  /**
   * Return no actor, without further checks, when the executing level's own record carries
   * none. Safe because an absent actor grants nothing. Not used when an ancestor may supply one.
   */
  skipWhenUnbound?: boolean;
};

export type HiddenChainValidation = {
  /**
   * The persisted actor value that authorizes the chain, or undefined when it carries none.
   * It is not live-checked here: pass it to `refreshWorkflowActor`.
   */
  actor: unknown;
  /** The executing level's persisted actor-bearing record. */
  holder: Record<string, unknown>;
};

const EXECUTION_SELECT = {
  id: true,
  organizationId: true,
  userId: true,
  workflowId: true,
  workflowVersionId: true,
  trigger: true,
  result: true,
  workflow: {
    select: {
      isDeleted: true,
      organizationId: true,
      userId: true,
      metadata: true,
      scheduleInitiatingActor: true,
    },
  },
  workflowVersion: {
    select: { workflowId: true, organizationId: true, userId: true },
  },
} as const;

type ExecutionRow = Prisma.WorkflowExecutionGetPayload<{
  select: typeof EXECUTION_SELECT;
}>;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function nonempty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Binds the engine context (and, when given, the action provenance) to one execution. */
export function hiddenExecutionRef(
  context: HiddenExecutionContext,
  provenance?: { executionId: string; workflowId: string },
  deny: WorkflowActorDenial = denyWorkflowActor,
): HiddenExecutionRef {
  const executionId = context.executionId ?? context.runId;
  if (
    !context.organizationId ||
    !context.userId ||
    !nonempty(executionId) ||
    (provenance !== undefined &&
      (provenance.executionId !== executionId ||
        provenance.workflowId !== context.workflowId))
  )
    return deny();
  return {
    executionId,
    organizationId: context.organizationId,
    userId: context.userId,
    workflowId: context.workflowId,
    workflowVersionId: context.workflowVersionId,
  };
}

/** The hidden system workflow canonical id, only for a live, code-owned, version-pinned row. */
function hiddenCanonicalId(row: ExecutionRow): string | undefined {
  if (
    row.workflow.isDeleted ||
    row.workflow.organizationId !== SYSTEM_WORKFLOW_PRINCIPAL_ID ||
    row.workflow.userId !== SYSTEM_WORKFLOW_PRINCIPAL_ID ||
    row.workflowVersion.organizationId !== SYSTEM_WORKFLOW_PRINCIPAL_ID ||
    row.workflowVersion.userId !== SYSTEM_WORKFLOW_PRINCIPAL_ID ||
    row.workflowVersion.workflowId !== row.workflowId ||
    !isHiddenSystemWorkflowMetadata(row.workflow.metadata)
  )
    return undefined;
  return getSystemWorkflowMetadata(row.workflow.metadata)?.canonicalId;
}

function findExecution(
  tx: Prisma.TransactionClient,
  ref: HiddenExecutionRef,
): Promise<ExecutionRow | null> {
  return tx.workflowExecution.findFirst({
    where: {
      id: ref.executionId,
      organizationId: ref.organizationId,
      isDeleted: false,
    },
    select: EXECUTION_SELECT,
  });
}

/** The persisted record that carries (or omits) the actor; empty for a missing or scrubbed row. */
function persistedHolder(
  row: ExecutionRow | null,
  rule: HiddenWorkflowRule,
): Record<string, unknown> {
  const inputValues = record(record(row?.result).inputValues);
  return rule.holderKey ? record(inputValues[rule.holderKey]) : inputValues;
}

function sameActor(
  left: unknown,
  right: unknown,
  organizationId: string,
  deny: WorkflowActorDenial,
): boolean {
  return (
    workflowActorKey(parseWorkflowActor(left, organizationId, deny), deny) ===
    workflowActorKey(parseWorkflowActor(right, organizationId, deny), deny)
  );
}

/**
 * Validates one pinned hidden execution and every ancestor it was fanned out from: each level
 * must be a live code-owned system workflow pinned to its immutable version, owned by the same
 * user, admitted by its rule, and carry the same actor as the level below. The actor is read
 * only from server-persisted execution records, never from the action's supplied input.
 */
export async function validateHiddenExecutionChain(
  tx: Prisma.TransactionClient,
  ref: HiddenExecutionRef,
  rule: HiddenWorkflowRule,
  options: HiddenChainOptions = {},
): Promise<HiddenChainValidation> {
  const deny = options.deny ?? denyWorkflowActor;
  const row = await findExecution(tx, ref);
  if (
    options.skipWhenUnbound &&
    persistedHolder(row, rule).initiatingActor === undefined
  )
    return { actor: undefined, holder: {} };
  if (
    !row ||
    row.userId !== ref.userId ||
    row.workflowId !== ref.workflowId ||
    (ref.workflowVersionId !== undefined &&
      row.workflowVersionId !== ref.workflowVersionId)
  )
    return deny();
  return validateLevel(tx, row, rule, options, deny);
}

async function validateLevel(
  tx: Prisma.TransactionClient,
  row: ExecutionRow,
  rule: HiddenWorkflowRule,
  options: HiddenChainOptions,
  deny: WorkflowActorDenial,
): Promise<HiddenChainValidation> {
  const metadata = record(record(row.result).metadata);
  const holder = persistedHolder(row, rule);
  const captured = holder.initiatingActor;

  const canonicalId = hiddenCanonicalId(row);
  if (
    canonicalId === undefined ||
    !rule.matches(canonicalId) ||
    (rule.accepts !== undefined && !rule.accepts(holder, row.organizationId))
  )
    return deny();
  if (
    captured !== undefined &&
    (options.bindActorToExecutionUser ?? true) &&
    parseWorkflowActor(captured, row.organizationId, deny).userId !== row.userId
  )
    return deny();

  if (metadata.parentExecutionId === undefined) {
    if (
      !rule.rootSources?.length ||
      metadata.canonicalId !== canonicalId ||
      typeof metadata.source !== 'string' ||
      !rule.rootSources.includes(metadata.source)
    )
      return deny();
    return { actor: captured, holder };
  }

  const index = metadata.workflowForEachIndex;
  if (
    !rule.parents?.length ||
    !nonempty(metadata.parentExecutionId) ||
    !nonempty(metadata.parentWorkflowId) ||
    !nonempty(metadata.parentNodeId) ||
    typeof index !== 'number' ||
    !Number.isInteger(index) ||
    index < 0
  )
    return deny();
  const parentNodeId = metadata.parentNodeId;
  const link = rule.parents.find(
    (candidate) =>
      candidate.kind === 'scheduled-tenant' || candidate.nodeId(parentNodeId),
  );
  if (!link) return deny();
  const parent = await findExecution(tx, {
    executionId: metadata.parentExecutionId,
    organizationId: row.organizationId,
    userId: row.userId,
    workflowId: metadata.parentWorkflowId,
  });
  if (
    !parent ||
    parent.userId !== row.userId ||
    parent.workflowId !== metadata.parentWorkflowId
  )
    return deny();

  if (link.kind === 'scheduled-tenant') {
    const bound = scheduledTenantActor(parent, row.organizationId, deny);
    if (
      captured !== undefined &&
      !sameActor(bound, captured, row.organizationId, deny)
    )
      return deny();
    return { actor: captured ?? bound, holder };
  }

  const ancestor = await validateLevel(tx, parent, link.rule, options, deny);
  if (!sameActor(ancestor.actor, captured, row.organizationId, deny))
    return deny();
  if (link.discovery) {
    const discovered = await tx.workflowExecutionNodeResult.findFirst({
      where: {
        organizationId: row.organizationId,
        executionId: parent.id,
        nodeId: link.discovery.nodeId,
      },
      select: { output: true },
    });
    const items = record(discovered?.output)[link.discovery.itemsKey];
    const item = record(Array.isArray(items) ? items[index] : undefined);
    if (
      !link.discovery.matches(item, holder) ||
      !sameActor(item.initiatingActor, captured, row.organizationId, deny)
    )
      return deny();
  }
  return { actor: captured, holder };
}

/**
 * The actor a tenant-owned scheduled run acts as: the server-written schedule binding, only
 * for a live tenant workflow pinned to its own version and started by the scheduler.
 */
function scheduledTenantActor(
  parent: ExecutionRow,
  organizationId: string,
  deny: WorkflowActorDenial,
): unknown {
  if (
    parent.workflow.isDeleted ||
    parent.workflow.organizationId !== organizationId ||
    parent.workflowVersion.workflowId !== parent.workflowId ||
    parent.workflowVersion.organizationId !== organizationId
  )
    return deny();
  if (
    parent.trigger !== WorkflowExecutionTrigger.SCHEDULED ||
    record(record(parent.result).metadata).triggeredBy !== 'schedule'
  )
    return undefined;
  return parent.workflow.scheduleInitiatingActor ?? undefined;
}
