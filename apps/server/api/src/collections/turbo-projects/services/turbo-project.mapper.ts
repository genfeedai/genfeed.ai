import {
  parseTurboProjectItemDispatch,
  parseTurboProjectQuote,
} from '@api/collections/turbo-projects/services/turbo-project-dispatch.util';
import { readTurboProjectIdea } from '@api/collections/turbo-projects/services/turbo-project-idea.util';
import {
  parseTurboProjectSettings,
  parseScheduledTargets,
} from '@api/collections/turbo-projects/services/turbo-project-settings.util';
import { countTurboProjectItems } from '@api/collections/turbo-projects/services/turbo-project-status.util';
import type {
  TurboProjectItemStatus,
  TurboProjectKind,
  TurboProjectStatus,
  TurboProjectStep,
} from '@genfeedai/contracts';
import type {
  ITurboProject,
  ITurboProjectItem,
} from '@genfeedai/contracts/interfaces';
import type { TurboProject, TurboProjectItem } from '@genfeedai/prisma';

export type TurboProjectWithItems = TurboProject & {
  items: TurboProjectItem[];
};

function toIsoString(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

/** Project fields without items, as the list shows them. */
export function toTurboProjectBase(
  row: TurboProject,
): Omit<ITurboProject, 'itemCounts' | 'items'> {
  return {
    brandId: row.brandId,
    createdAt: row.createdAt.toISOString(),
    id: row.id,
    isDeleted: row.isDeleted,
    kind: row.kind as TurboProjectKind,
    name: row.name,
    organizationId: row.organizationId,
    quote: parseTurboProjectQuote(row.quote),
    reviewTurboRunId: row.reviewTurboRunId,
    revision: row.revision,
    settings: parseTurboProjectSettings(row.settings),
    status: row.status as TurboProjectStatus,
    step: row.step as TurboProjectStep,
    updatedAt: row.updatedAt.toISOString(),
    userId: row.userId,
    workflowId: row.workflowId,
  };
}

export function toTurboProjectItem(item: TurboProjectItem): ITurboProjectItem {
  return {
    caption: item.caption,
    createdAt: item.createdAt.toISOString(),
    dispatch: parseTurboProjectItemDispatch(item.dispatch),
    dispatchedAt: toIsoString(item.dispatchedAt),
    error: item.error,
    id: item.id,
    idea: readTurboProjectIdea(item.idea),
    inputCategory: item.inputCategory,
    inputIngredientId: item.inputIngredientId,
    outputCategory: item.outputCategory,
    outputIngredientId: item.outputIngredientId,
    position: item.position,
    postId: item.postId,
    projectId: item.projectId,
    retryCount: item.retryCount,
    reviewTurboRunId: item.reviewTurboRunId,
    reviewItemId: item.reviewItemId,
    scheduledAt: toIsoString(item.scheduledAt),
    scheduledTargets: parseScheduledTargets(item.scheduledTargets),
    status: item.status as TurboProjectItemStatus,
    updatedAt: item.updatedAt.toISOString(),
    workflowExecutionId: item.workflowExecutionId,
    workflowItemIndex: item.workflowItemIndex,
  };
}

export function toTurboProject(row: TurboProjectWithItems): ITurboProject {
  return {
    ...toTurboProjectBase(row),
    itemCounts: countTurboProjectItems(row.items),
    items: row.items.map(toTurboProjectItem),
  };
}
