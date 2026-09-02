import { SYSTEM_WORKFLOW_METADATA_KEY } from '@api/collections/workflows/system-workflow.contract';

type WorkflowListWhereInput = {
  brandId?: string;
  includeSystem: boolean;
  isDeleted: boolean;
  organizationId: string;
  referencable: boolean;
  userId: string;
};

const EXCLUDE_SYSTEM_WORKFLOW = {
  NOT: {
    metadata: {
      equals: 'system-workflow',
      path: [SYSTEM_WORKFLOW_METADATA_KEY, 'kind'],
    },
  },
} as const;

/**
 * Customer Automation lists tenant-authored workflows only.
 * Persisted system-workflow clones stay on Admin → Automation → Workflows
 * (`includeSystem=true`).
 */
export function buildWorkflowListWhere(
  input: WorkflowListWhereInput,
): Record<string, unknown> {
  const base: Record<string, unknown> = {
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
