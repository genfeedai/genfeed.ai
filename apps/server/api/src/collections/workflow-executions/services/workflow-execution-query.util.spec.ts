import { buildCustomerExecutionWhere } from '@api/collections/workflow-executions/services/workflow-execution-query.util';
import { BATCH_WORKFLOW_EXECUTION_ID } from '@api/collections/workflows/services/batch-workflow-execution.definition';
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

const batch = {
  workflow: {
    organizationId: SYSTEM_WORKFLOW_PRINCIPAL_ID,
    isDeleted: false,
    metadata: {
      path: ['systemWorkflow', 'canonicalId'],
      equals: BATCH_WORKFLOW_EXECUTION_ID,
    },
  },
};

describe('customer execution visibility', () => {
  it('requires tenant ownership and a live customer workflow, canonical proactive run, or batch parent', () => {
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
            batch,
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
        { OR: [authored, expect.any(Object), batch] },
        {
          // Batch parents record no brand anywhere (`StartBatchWorkflowExecutionInput`
          // has no `brandId`, and neither `inputValues` nor `metadata.batchExecution`
          // carries one) — a brand-filtered query has no batch alternative and
          // correctly excludes them; see the behavioral tests below.
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

/**
 * Behavioral (#5398): builds a minimal in-memory evaluator for the exact
 * Prisma filter shapes `buildCustomerExecutionWhere` emits (`AND`/`OR`/`NOT`,
 * relation objects, and JSON `{ path, equals }` filters against `result` /
 * `workflow.metadata`) and checks whether representative rows would or
 * would not be selected — the structural tests above catch a shape
 * regression, these catch a visibility regression. Same pattern as
 * `daily-publishing.integration.spec.ts`'s file-local `matches()` fake —
 * this repo does not spin up a real Postgres for a where-clause unit test.
 */
type FakeWorkflow = {
  organizationId: string;
  isDeleted: boolean;
  brandId?: string | null;
  metadata?: Record<string, unknown>;
};
type FakeExecution = {
  organizationId: string;
  isDeleted: boolean;
  workflowId?: string;
  status?: string;
  trigger?: string;
  result?: Record<string, unknown>;
  workflow: FakeWorkflow;
};

function resolveJsonPath(value: unknown, path: string[]): unknown {
  return path.reduce<unknown>((acc, segment) => {
    if (acc !== null && typeof acc === 'object' && segment in acc) {
      return (acc as Record<string, unknown>)[segment];
    }
    return undefined;
  }, value);
}

function isJsonPathFilter(
  value: unknown,
): value is { path: string[]; equals: unknown } {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    Array.isArray((value as Record<string, unknown>).path) &&
    'equals' in (value as Record<string, unknown>)
  );
}

function evaluateFilter(
  row: Record<string, unknown>,
  filter: Record<string, unknown>,
): boolean {
  return Object.entries(filter).every(([key, expected]) => {
    if (key === 'AND') {
      return (expected as Record<string, unknown>[]).every((sub) =>
        evaluateFilter(row, sub),
      );
    }
    if (key === 'OR') {
      return (expected as Record<string, unknown>[]).some((sub) =>
        evaluateFilter(row, sub),
      );
    }
    if (key === 'NOT') {
      return !evaluateFilter(row, expected as Record<string, unknown>);
    }
    const actual = row[key];
    if (isJsonPathFilter(expected)) {
      const resolved = resolveJsonPath(actual, expected.path);
      if (expected.equals === Prisma.AnyNull) {
        return resolved === null || resolved === undefined;
      }
      return resolved === expected.equals;
    }
    if (
      expected !== null &&
      typeof expected === 'object' &&
      !Array.isArray(expected)
    ) {
      return evaluateFilter(
        (actual ?? {}) as Record<string, unknown>,
        expected as Record<string, unknown>,
      );
    }
    return actual === expected;
  });
}

function isVisible(execution: FakeExecution, organizationId: string): boolean {
  return evaluateFilter(
    execution as unknown as Record<string, unknown>,
    buildCustomerExecutionWhere(organizationId) as unknown as Record<
      string,
      unknown
    >,
  );
}

function batchParentExecution(
  overrides: Partial<FakeExecution> = {},
): FakeExecution {
  return {
    organizationId: 'org-1',
    isDeleted: false,
    result: { metadata: { canonicalId: BATCH_WORKFLOW_EXECUTION_ID } },
    workflow: {
      organizationId: SYSTEM_WORKFLOW_PRINCIPAL_ID,
      isDeleted: false,
      metadata: {
        systemWorkflow: { canonicalId: BATCH_WORKFLOW_EXECUTION_ID },
      },
    },
    ...overrides,
  };
}

describe('batch execution visibility (behavioral, #5398)', () => {
  it('includes a same-org batch parent execution', () => {
    expect(isVisible(batchParentExecution(), 'org-1')).toBe(true);
  });

  it('excludes a batch parent execution owned by another organization — the top-level org filter wins', () => {
    // The row itself belongs to org-1 (its own tenant); org-2 requesting it
    // must not see it, batch alternative or not.
    expect(isVisible(batchParentExecution(), 'org-2')).toBe(false);
  });

  it('excludes a non-batch hidden system workflow execution', () => {
    const execution = batchParentExecution({
      result: { metadata: { canonicalId: 'some.other.system.workflow' } },
      workflow: {
        organizationId: SYSTEM_WORKFLOW_PRINCIPAL_ID,
        isDeleted: false,
        metadata: {
          systemWorkflow: { canonicalId: 'some.other.system.workflow' },
        },
      },
    });
    expect(isVisible(execution, 'org-1')).toBe(false);
  });

  it('still includes an authored tenant workflow execution (regression)', () => {
    const execution: FakeExecution = {
      organizationId: 'org-1',
      isDeleted: false,
      workflow: { organizationId: 'org-1', isDeleted: false },
    };
    expect(isVisible(execution, 'org-1')).toBe(true);
  });

  it('still includes a proactive agent-turn execution (regression)', () => {
    const execution: FakeExecution = {
      organizationId: 'org-1',
      isDeleted: false,
      result: {
        metadata: {
          source: 'proactive',
          canonicalId: 'agent.turn.execute',
          strategyId: 'agent-1',
        },
      },
      workflow: {
        organizationId: SYSTEM_WORKFLOW_PRINCIPAL_ID,
        isDeleted: false,
        metadata: { systemWorkflow: { canonicalId: 'agent.turn.execute' } },
      },
    };
    expect(isVisible(execution, 'org-1')).toBe(true);
  });

  it('excludes a batch parent from a brand-filtered query — it has no brand to match', () => {
    const where = buildCustomerExecutionWhere('org-1', { brandId: 'brand-1' });
    expect(
      evaluateFilter(
        batchParentExecution() as unknown as Record<string, unknown>,
        where as unknown as Record<string, unknown>,
      ),
    ).toBe(false);
  });

  it('still includes a brand-matching authored tenant workflow execution under brand filtering (regression)', () => {
    const where = buildCustomerExecutionWhere('org-1', { brandId: 'brand-1' });
    const execution: FakeExecution = {
      organizationId: 'org-1',
      isDeleted: false,
      workflow: {
        organizationId: 'org-1',
        isDeleted: false,
        brandId: 'brand-1',
      },
    };
    expect(
      evaluateFilter(
        execution as unknown as Record<string, unknown>,
        where as unknown as Record<string, unknown>,
      ),
    ).toBe(true);
  });
});
