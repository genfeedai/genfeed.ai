import type { WorkflowExecutionQueryDto } from '@api/collections/workflow-executions/dto/create-workflow-execution.dto';
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
