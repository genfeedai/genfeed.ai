import {
  buildHiddenSystemWorkflowMetadata,
  SYSTEM_WORKFLOW_PRINCIPAL_ID,
} from '@api/collections/workflows/system-workflow.contract';

/** Persisted-row builders for hidden-execution chain specs; plain data, no mocks. */
export const CHAIN_ACTOR = {
  userId: 'opaque-user',
  organizationId: 'org',
  isApiKey: false,
  scopes: [] as string[],
};

export type ExecutionFixture = {
  id: string;
  organizationId: string;
  result: {
    inputValues: Record<string, unknown>;
    metadata: Record<string, unknown>;
  };
  trigger: string | null;
  userId: string;
  workflow: {
    isDeleted: boolean;
    metadata: Record<string, unknown>;
    organizationId: string;
    platformSeedKey: string | null;
    scheduleInitiatingActor: unknown;
    userId: string;
  };
  workflowId: string;
  workflowVersion: {
    organizationId: string;
    userId: string;
    workflowId: string;
  };
  workflowVersionId: string;
};

type RowOptions = {
  canonicalId?: string;
  id: string;
  inputValues?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  organizationId?: string;
  userId?: string;
  versionId?: string;
  workflowId?: string;
};

/** A code-owned, version-pinned hidden system workflow execution. */
export function hiddenExecutionRow(options: RowOptions): ExecutionFixture {
  const workflowId = options.workflowId ?? `workflow-${options.id}`;
  return {
    id: options.id,
    organizationId: options.organizationId ?? 'org',
    userId: options.userId ?? CHAIN_ACTOR.userId,
    workflowId,
    workflowVersionId: options.versionId ?? `version-${options.id}`,
    trigger: null,
    workflow: {
      isDeleted: false,
      organizationId: SYSTEM_WORKFLOW_PRINCIPAL_ID,
      userId: SYSTEM_WORKFLOW_PRINCIPAL_ID,
      platformSeedKey: null,
      scheduleInitiatingActor: null,
      metadata: {
        sourceType: 'hidden-system-workflow',
        systemWorkflow: buildHiddenSystemWorkflowMetadata({
          canonicalId: options.canonicalId ?? 'canonical',
        }),
      },
    },
    workflowVersion: {
      organizationId: SYSTEM_WORKFLOW_PRINCIPAL_ID,
      userId: SYSTEM_WORKFLOW_PRINCIPAL_ID,
      workflowId,
    },
    result: {
      inputValues: options.inputValues ?? {},
      metadata: {
        canonicalId: options.canonicalId ?? 'canonical',
        ...options.metadata,
      },
    },
  };
}

type TenantOptions = {
  actor?: unknown;
  id: string;
  organizationId?: string;
  platformSeedKey?: string;
  trigger?: string | null;
  triggeredBy?: string;
  userId?: string;
  workflowId?: string;
};

/** A tenant-owned workflow execution, as the scheduler or a manual run records it. */
export function tenantExecutionRow(options: TenantOptions): ExecutionFixture {
  const workflowId = options.workflowId ?? `workflow-${options.id}`;
  const organizationId = options.organizationId ?? 'org';
  return {
    id: options.id,
    organizationId,
    userId: options.userId ?? CHAIN_ACTOR.userId,
    workflowId,
    workflowVersionId: `version-${options.id}`,
    trigger: options.trigger === undefined ? 'scheduled' : options.trigger,
    workflow: {
      isDeleted: false,
      organizationId,
      userId: 'workflow-creator',
      platformSeedKey: options.platformSeedKey ?? null,
      scheduleInitiatingActor: options.actor ?? null,
      metadata: {},
    },
    workflowVersion: {
      organizationId,
      userId: 'workflow-creator',
      workflowId,
    },
    result: {
      inputValues: {},
      metadata: { triggeredBy: options.triggeredBy ?? 'schedule' },
    },
  };
}

/** The `where.id` lookup the validator performs, answered from a fixed set of rows. */
export function executionLookup(rows: Array<{ id: string }>) {
  return async (args: { where: { id: string; organizationId?: string } }) =>
    rows.find(
      (row) =>
        row.id === args.where.id &&
        (args.where.organizationId === undefined ||
          (row as { organizationId?: string }).organizationId ===
            args.where.organizationId),
    ) ?? null;
}

export function executionContext(row: {
  id: string;
  organizationId: string;
  userId: string;
  workflowId: string;
  workflowVersionId: string;
}) {
  return {
    executionId: row.id,
    organizationId: row.organizationId,
    runId: row.id,
    userId: row.userId,
    workflowId: row.workflowId,
    workflowVersionId: row.workflowVersionId,
  };
}
