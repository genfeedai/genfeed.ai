import { SYSTEM_WORKFLOW_METADATA_KEY } from '@api/collections/workflows/system-workflow.contract';
import { Prisma } from '@genfeedai/prisma';

type WorkflowListWhereInput = {
  brandId?: string;
  includeSystem: boolean;
  isDeleted: boolean;
  organizationId: string;
  referencable: boolean;
  userId: string;
};

const SYSTEM_WORKFLOW_KIND_PATH = [
  SYSTEM_WORKFLOW_METADATA_KEY,
  'kind',
] as const;

/**
 * Drop persisted system-workflow clones from customer Automation.
 *
 * A lone Prisma `NOT { metadata.path equals 'system-workflow' }` becomes SQL
 * UNKNOWN when `metadata` is NULL — the default for tenant-authored rows — so
 * GET /workflows returns an empty library while GET :id still loads the
 * editor. Keep NULL / missing-kind rows; exclude only explicit system clones.
 */
export const EXCLUDE_SYSTEM_WORKFLOW: Prisma.WorkflowWhereInput = {
  AND: [
    {
      OR: [
        { metadata: { equals: Prisma.AnyNull } },
        {
          metadata: {
            equals: Prisma.AnyNull,
            path: [...SYSTEM_WORKFLOW_KIND_PATH],
          },
        },
        {
          NOT: {
            metadata: {
              equals: 'system-workflow',
              path: [...SYSTEM_WORKFLOW_KIND_PATH],
            },
          },
        },
      ],
    },
  ],
};

/**
 * Customer Automation lists tenant-authored workflows only.
 * Persisted system-workflow clones stay on Admin → Automation → Workflows
 * (`includeSystem=true`).
 */
export function buildWorkflowListWhere(
  input: WorkflowListWhereInput,
): Prisma.WorkflowWhereInput {
  const base: Prisma.WorkflowWhereInput = {
    isDeleted: input.isDeleted,
    organizationId: input.organizationId,
    ...(input.brandId ? { brandId: input.brandId } : {}),
  };

  if (input.includeSystem) {
    if (input.referencable) {
      return base;
    }

    return {
      ...base,
      OR: [
        { userId: input.userId },
        {
          metadata: {
            equals: 'organization',
            path: [SYSTEM_WORKFLOW_METADATA_KEY, 'visibility'],
          },
        },
      ],
    };
  }

  if (input.referencable) {
    return { ...base, ...EXCLUDE_SYSTEM_WORKFLOW };
  }

  return {
    ...base,
    ...EXCLUDE_SYSTEM_WORKFLOW,
    userId: input.userId,
  };
}
