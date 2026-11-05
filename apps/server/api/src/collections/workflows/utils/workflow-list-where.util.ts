import type { Prisma } from '@genfeedai/prisma';
import { BadRequestException } from '@nestjs/common';

export const MAX_WORKFLOW_QUERY_IDS = 50;

type WorkflowListWhereInput = {
  brandId?: string;
  includeSystem: boolean;
  isDeleted: boolean;
  organizationId: string;
  referencable: boolean;
  userId: string;
};

export function buildWorkflowVisibilityWhere(scope: {
  organizationId: string;
  userId: string;
}): Prisma.WorkflowWhereInput {
  return {
    isDeleted: false,
    organizationId: scope.organizationId,
    OR: [
      { userId: scope.userId },
      {
        systemWorkflowVisibility: 'organization',
      },
    ],
  };
}

export function buildWorkflowIdsWhere(
  ids: string[],
  scope: { organizationId: string; userId: string; brandId?: string },
): Prisma.WorkflowWhereInput {
  if (ids.length > MAX_WORKFLOW_QUERY_IDS) {
    throw new BadRequestException(
      `At most ${MAX_WORKFLOW_QUERY_IDS} workflow IDs may be requested`,
    );
  }
  return {
    ...buildWorkflowVisibilityWhere(scope),
    ...(scope.brandId ? { brandId: scope.brandId } : {}),
    id: { in: ids },
  };
}

/**
 * Drop persisted system-workflow clones from customer Automation.
 *
 * Reads the promoted `systemWorkflowKind` column (a copy of
 * `metadata.systemWorkflow.kind`), so the list never detoasts `metadata`. The
 * column is NULL for tenant-authored rows, and a lone
 * `NOT { systemWorkflowKind: 'system-workflow' }` is SQL UNKNOWN for NULL, which
 * would hide every tenant workflow. Keep NULL rows; exclude only explicit
 * system clones.
 */
export const EXCLUDE_SYSTEM_WORKFLOW: Prisma.WorkflowWhereInput = {
  // Wrapped in AND so spreading this next to a caller's own OR keeps both.
  AND: [
    {
      OR: [
        { systemWorkflowKind: null },
        { systemWorkflowKind: { not: 'system-workflow' } },
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
          systemWorkflowVisibility: 'organization',
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
