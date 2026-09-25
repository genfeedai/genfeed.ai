import { buildCustomerExecutionWhere } from '@api/collections/workflow-executions/services/workflow-execution-query.util';
import { SYSTEM_WORKFLOW_PRINCIPAL_ID } from '@api/collections/workflows/system-workflow.contract';
import { EXCLUDE_SYSTEM_WORKFLOW } from '@api/collections/workflows/utils/workflow-list-where.util';
import { Prisma } from '@genfeedai/prisma';

const authored = {
  workflow: {
    organizationId: 'org-1',
    isDeleted: false,
    ...EXCLUDE_SYSTEM_WORKFLOW,
  },
};

describe('customer execution visibility', () => {
  it('requires tenant ownership and a live customer workflow or canonical proactive run', () => {
    expect(buildCustomerExecutionWhere('org-1')).toEqual({
      organizationId: 'org-1',
      isDeleted: false,
      AND: [
        {
          OR: [
            authored,
            {
              AND: [
                {
                  result: { path: ['metadata', 'source'], equals: 'proactive' },
                },
                {
                  result: {
                    path: ['metadata', 'canonicalId'],
                    equals: 'agent.turn.execute',
                  },
                },
                {
                  NOT: {
                    result: {
                      path: ['metadata', 'strategyId'],
                      equals: Prisma.AnyNull,
                    },
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
            },
          ],
        },
      ],
    });
  });

  it('combines visibility, brand and strategy instead of overwriting an OR filter', () => {
    const where = buildCustomerExecutionWhere('org-1', {
      brandId: 'brand-1',
      strategyId: 'agent-1',
      workflowId: 'wf-1',
    });
    expect(where).toMatchObject({
      organizationId: 'org-1',
      isDeleted: false,
      workflowId: 'wf-1',
      AND: [
        { OR: [authored, expect.any(Object)] },
        {
          OR: [
            {
              workflow: {
                organizationId: 'org-1',
                isDeleted: false,
                brandId: 'brand-1',
              },
            },
            expect.objectContaining({
              result: { path: ['metadata', 'brandId'], equals: 'brand-1' },
              AND: expect.arrayContaining([
                {
                  result: { path: ['metadata', 'source'], equals: 'proactive' },
                },
              ]),
            }),
          ],
        },
        {
          OR: [
            { result: { path: ['metadata', 'strategyId'], equals: 'agent-1' } },
            {
              result: {
                path: ['metadata', 'agentStrategyId'],
                equals: 'agent-1',
              },
            },
          ],
        },
      ],
    });
  });
});
