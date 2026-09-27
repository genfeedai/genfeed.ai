import type { WorkflowExecutionQueryDto } from '@api/collections/workflow-executions/dto/create-workflow-execution.dto';
import { BATCH_WORKFLOW_EXECUTION_ID } from '@api/collections/workflows/services/batch-workflow-execution.definition';
import { SYSTEM_WORKFLOW_PRINCIPAL_ID } from '@api/collections/workflows/system-workflow.contract';
import { EXCLUDE_SYSTEM_WORKFLOW } from '@api/collections/workflows/utils/workflow-list-where.util';
import { Prisma } from '@genfeedai/prisma';

/** Customer activity includes authored workflows and intentional proactive agent runs. */
export function buildCustomerExecutionWhere(
  organizationId: string,
  query: Pick<
    WorkflowExecutionQueryDto,
    'brandId' | 'status' | 'strategyId' | 'trigger' | 'workflowId'
  > = {},
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
