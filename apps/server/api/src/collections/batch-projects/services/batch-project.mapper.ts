import { readBatchProjectIdea } from '@api/collections/batch-projects/services/batch-project-idea.util';
import {
  parseBatchProjectSettings,
  parseScheduledTargets,
} from '@api/collections/batch-projects/services/batch-project-settings.util';
import { countBatchProjectItems } from '@api/collections/batch-projects/services/batch-project-status.util';
import type {
  BatchProjectItemStatus,
  BatchProjectKind,
  BatchProjectStatus,
  BatchProjectStep,
} from '@genfeedai/contracts';
import type {
  IBatchProject,
  IBatchProjectItem,
} from '@genfeedai/contracts/interfaces';
import type { BatchProject, BatchProjectItem } from '@genfeedai/prisma';

export type BatchProjectWithItems = BatchProject & {
  items: BatchProjectItem[];
};

function toIsoString(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

/** Project fields without items, as the list shows them. */
export function toBatchProjectBase(
  row: BatchProject,
): Omit<IBatchProject, 'itemCounts' | 'items'> {
  return {
    brandId: row.brandId,
    createdAt: row.createdAt.toISOString(),
    id: row.id,
    isDeleted: row.isDeleted,
    kind: row.kind as BatchProjectKind,
    name: row.name,
    organizationId: row.organizationId,
    reviewBatchId: row.reviewBatchId,
    settings: parseBatchProjectSettings(row.settings),
    status: row.status as BatchProjectStatus,
    step: row.step as BatchProjectStep,
    updatedAt: row.updatedAt.toISOString(),
    userId: row.userId,
    workflowId: row.workflowId,
  };
}

export function toBatchProjectItem(item: BatchProjectItem): IBatchProjectItem {
  return {
    caption: item.caption,
    createdAt: item.createdAt.toISOString(),
    dispatchedAt: toIsoString(item.dispatchedAt),
    error: item.error,
    id: item.id,
    idea: readBatchProjectIdea(item.idea),
    inputCategory: item.inputCategory,
    inputIngredientId: item.inputIngredientId,
    outputCategory: item.outputCategory,
    outputIngredientId: item.outputIngredientId,
    position: item.position,
    postId: item.postId,
    projectId: item.projectId,
    retryCount: item.retryCount,
    reviewBatchId: item.reviewBatchId,
    reviewItemId: item.reviewItemId,
    scheduledAt: toIsoString(item.scheduledAt),
    scheduledTargets: parseScheduledTargets(item.scheduledTargets),
    status: item.status as BatchProjectItemStatus,
    updatedAt: item.updatedAt.toISOString(),
    workflowExecutionId: item.workflowExecutionId,
    workflowItemIndex: item.workflowItemIndex,
  };
}

export function toBatchProject(row: BatchProjectWithItems): IBatchProject {
  return {
    ...toBatchProjectBase(row),
    itemCounts: countBatchProjectItems(row.items),
    items: row.items.map(toBatchProjectItem),
  };
}
