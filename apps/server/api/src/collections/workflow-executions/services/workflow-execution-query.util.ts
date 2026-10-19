import type { WorkflowExecutionQueryDto } from '@api/collections/workflow-executions/dto/create-workflow-execution.dto';
import { BATCH_WORKFLOW_EXECUTION_ID } from '@api/collections/workflows/services/batch-workflow-execution.definition';
import { SYSTEM_WORKFLOW_PRINCIPAL_ID } from '@api/collections/workflows/system-workflow.contract';
import { EXCLUDE_SYSTEM_WORKFLOW } from '@api/collections/workflows/utils/workflow-list-where.util';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import { Prisma } from '@genfeedai/prisma';
import { crossOrgUnsafe } from '@libs/prisma/tenant-context';

type CustomerExecutionQuery = Pick<
  WorkflowExecutionQueryDto,
  'brandId' | 'status' | 'strategyId' | 'trigger' | 'workflowId'
>;

/**
 * The workflows each arm of the customer-activity filter admits, resolved up
 * front so the execution query can match `workflowId IN (...)`.
 *
 * Filtering through the `workflow` relation makes Prisma LEFT JOIN `workflows`
 * once per arm. Postgres then joins and filters every execution of the
 * organization before it can order or count them, so a list page or a count
 * cost seconds once an organization held a few hundred thousand proactive runs.
 */
export interface CustomerExecutionWorkflowIds {
  /** Tenant-authored workflows (system clones excluded). */
  authored: string[];
  /** The hidden `agent.turn.execute` system workflow behind proactive runs. */
  agentTurn: string[];
  /** The hidden batch-run system workflow. */
  batch: string[];
}

function systemWorkflowIds(canonicalId: string, prisma: PrismaService) {
  // Platform-owned system workflows live under the system principal, not the
  // caller's organization; only ids leave this read.
  return crossOrgUnsafe(
    async () =>
      await prisma.workflow.findMany({
        select: { id: true },
        where: {
          isDeleted: false,
          metadata: {
            path: ['systemWorkflow', 'canonicalId'],
            equals: canonicalId,
          },
          organizationId: SYSTEM_WORKFLOW_PRINCIPAL_ID,
        },
      }),
  );
}

export async function resolveCustomerExecutionWorkflowIds(
  prisma: PrismaService,
  organizationId: string,
  query: Pick<CustomerExecutionQuery, 'brandId'> = {},
): Promise<CustomerExecutionWorkflowIds> {
  const [authored, agentTurn, batch] = await Promise.all([
    prisma.workflow.findMany({
      select: { id: true },
      where: scopedWhere(organizationId, {
        ...EXCLUDE_SYSTEM_WORKFLOW,
        ...(query.brandId ? { brandId: query.brandId } : {}),
      }),
    }),
    systemWorkflowIds('agent.turn.execute', prisma),
    // A brand-filtered view never includes batch runs (they record no brand).
    query.brandId
      ? Promise.resolve([])
      : systemWorkflowIds(BATCH_WORKFLOW_EXECUTION_ID, prisma),
  ]);

  return {
    agentTurn: agentTurn.map(({ id }) => id),
    authored: authored.map(({ id }) => id),
    batch: batch.map(({ id }) => id),
  };
}

/**
 * `buildCustomerExecutionWhere` with the workflow arms expressed as
 * `workflowId IN (...)`: the same rows, without joining `workflows` per arm.
 */
function buildCustomerExecutionIdsWhere(
  organizationId: string,
  query: CustomerExecutionQuery,
  ids: CustomerExecutionWorkflowIds,
): Prisma.WorkflowExecutionWhereInput {
  const proactive: Prisma.WorkflowExecutionWhereInput = {
    AND: [
      { result: { path: ['metadata', 'source'], equals: 'proactive' } },
      {
        result: {
          path: ['metadata', 'canonicalId'],
          equals: 'agent.turn.execute',
        },
      },
      {
        NOT: {
          result: { path: ['metadata', 'strategyId'], equals: Prisma.AnyNull },
        },
      },
      ...(query.brandId
        ? [
            {
              result: {
                path: ['metadata', 'brandId'],
                equals: query.brandId,
              },
            },
          ]
        : []),
    ],
    workflowId: { in: ids.agentTurn },
  };

  return {
    organizationId,
    isDeleted: false,
    ...(query.workflowId ? { workflowId: query.workflowId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.trigger ? { trigger: query.trigger } : {}),
    AND: [
      {
        OR: [
          { workflowId: { in: ids.authored } },
          proactive,
          ...(query.brandId ? [] : [{ workflowId: { in: ids.batch } }]),
        ],
      },
      ...(query.strategyId
        ? [
            {
              OR: [
                {
                  result: {
                    path: ['metadata', 'strategyId'],
                    equals: query.strategyId,
                  },
                },
                {
                  result: {
                    path: ['metadata', 'agentStrategyId'],
                    equals: query.strategyId,
                  },
                },
              ],
            },
          ]
        : []),
    ],
  };
}

/** Customer activity includes authored workflows and intentional proactive agent runs. */
export function buildCustomerExecutionWhere(
  organizationId: string,
  query: CustomerExecutionQuery = {},
  /** Resolved ids for the list/count paths; omit for single-row lookups. */
  ids?: CustomerExecutionWorkflowIds,
): Prisma.WorkflowExecutionWhereInput {
  if (ids) {
    return buildCustomerExecutionIdsWhere(organizationId, query, ids);
  }

  const proactive: Prisma.WorkflowExecutionWhereInput = {
    AND: [
      { result: { path: ['metadata', 'source'], equals: 'proactive' } },
      {
        result: {
          path: ['metadata', 'canonicalId'],
          equals: 'agent.turn.execute',
        },
      },
      {
        NOT: {
          result: { path: ['metadata', 'strategyId'], equals: Prisma.AnyNull },
        },
      },
    ],
    workflow: {
      organizationId: SYSTEM_WORKFLOW_PRINCIPAL_ID,
      isDeleted: false,
      metadata: {
        path: ['systemWorkflow', 'canonicalId'],
        equals: 'agent.turn.execute',
      },
    },
  };
  // A batch run's parent execution is also a hidden system workflow (#5398)
  // — the tenant who started it owns the *execution* row (scoped below by
  // the unconditional top-level `organizationId` + `isDeleted`), but its
  // `workflow` relation is the shared `workflow.batch.execute` system
  // workflow, so it matched neither branch above and was invisible to every
  // real customer. `BatchWorkflowExecutionService.startBatchExecution`
  // never records a brand (`StartBatchWorkflowExecutionInput` has no
  // `brandId`, and neither its `inputValues` nor its `metadata.batchExecution`
  // payload carries one), so — unlike `proactive` — there is no brand to
  // match against; a brand-filtered query correctly excludes batch runs
  // rather than guessing one.
  const batch: Prisma.WorkflowExecutionWhereInput = {
    workflow: {
      organizationId: SYSTEM_WORKFLOW_PRINCIPAL_ID,
      isDeleted: false,
      metadata: {
        path: ['systemWorkflow', 'canonicalId'],
        equals: BATCH_WORKFLOW_EXECUTION_ID,
      },
    },
  };
  return {
    organizationId,
    isDeleted: false,
    ...(query.workflowId ? { workflowId: query.workflowId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.trigger ? { trigger: query.trigger } : {}),
    AND: [
      {
        OR: [
          {
            workflow: {
              organizationId,
              isDeleted: false,
              ...EXCLUDE_SYSTEM_WORKFLOW,
            },
          },
          proactive,
          batch,
        ],
      },
      ...(query.brandId
        ? [
            {
              OR: [
                {
                  workflow: {
                    organizationId,
                    isDeleted: false,
                    brandId: query.brandId,
                  },
                },
                {
                  ...proactive,
                  result: {
                    path: ['metadata', 'brandId'],
                    equals: query.brandId,
                  },
                },
              ],
            },
          ]
        : []),
      ...(query.strategyId
        ? [
            {
              OR: [
                {
                  result: {
                    path: ['metadata', 'strategyId'],
                    equals: query.strategyId,
                  },
                },
                {
                  result: {
                    path: ['metadata', 'agentStrategyId'],
                    equals: query.strategyId,
                  },
                },
              ],
            },
          ]
        : []),
    ],
  };
}
