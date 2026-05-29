import type { Ingredient } from '@models/content/ingredient.model';
import type { TaskEvent } from '@services/management/tasks.service';

// ─── Private types ────────────────────────────────────────────────────────────

export interface WorkspaceTaskLinkedRunSummary {
  generatedContentCount: number;
  reportThreadCount: number;
  reportThreadId: string | null;
}

export interface WorkspaceTaskLinkedOutputSummary {
  error: string | null;
  isLoading: boolean;
  outputs: Ingredient[];
}

export interface WorkspaceTaskOutputGroup {
  children: Ingredient[];
  root: Ingredient;
}

export interface WorkspaceTaskLinkedIssueSummary {
  href: string | null;
  identifier: string | null;
  isLoading: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function isNonEmptyString(
  value: string | null | undefined,
): value is string {
  return typeof value === 'string' && value.length > 0;
}

export function getEmptyLinkedRunSummary(): WorkspaceTaskLinkedRunSummary {
  return {
    generatedContentCount: 0,
    reportThreadCount: 0,
    reportThreadId: null,
  };
}

export function getEmptyLinkedOutputSummary(): WorkspaceTaskLinkedOutputSummary {
  return {
    error: null,
    isLoading: false,
    outputs: [],
  };
}

export function getEmptyLinkedIssueSummary(): WorkspaceTaskLinkedIssueSummary {
  return {
    href: null,
    identifier: null,
    isLoading: false,
  };
}

export function getWorkspaceLinkedOutputTitle(output: Ingredient): string {
  const metadataLabel = output.metadataLabel?.trim();
  if (metadataLabel) {
    return metadataLabel;
  }

  const metadataDescription = output.metadataDescription?.trim();
  if (metadataDescription) {
    return metadataDescription;
  }

  const promptText = output.promptText?.trim();
  if (promptText) {
    return promptText;
  }

  return output.id;
}

export function getWorkspaceLinkedOutputDescription(
  output: Ingredient,
): string | null {
  const metadataDescription = output.metadataDescription?.trim();
  if (metadataDescription) {
    return metadataDescription;
  }

  const promptText = output.promptText?.trim();
  if (promptText) {
    return promptText;
  }

  return null;
}

export function groupWorkspaceLinkedOutputs(
  outputs: Ingredient[],
): WorkspaceTaskOutputGroup[] {
  const activeOutputs = outputs.filter((output) => output.isDeleted !== true);
  const outputMap = new Map(activeOutputs.map((output) => [output.id, output]));
  const groups = new Map<string, WorkspaceTaskOutputGroup>();

  for (const output of activeOutputs) {
    const parentId =
      typeof output.parent === 'string'
        ? output.parent
        : (output.parent?.id ?? null);
    const rootId = parentId && outputMap.has(parentId) ? parentId : output.id;
    const root = outputMap.get(rootId) ?? output;
    const existingGroup = groups.get(rootId);

    if (!existingGroup) {
      groups.set(rootId, {
        children: root.id === output.id ? [] : [output],
        root,
      });
      continue;
    }

    if (output.id !== existingGroup.root.id) {
      existingGroup.children.push(output);
    }
  }

  return Array.from(groups.values()).toSorted((left, right) => {
    const leftTime = new Date(left.root.updatedAt ?? left.root.createdAt ?? 0);
    const rightTime = new Date(
      right.root.updatedAt ?? right.root.createdAt ?? 0,
    );
    return rightTime.getTime() - leftTime.getTime();
  });
}

export function formatWorkspaceEventLabel(event: TaskEvent): string {
  switch (event.type) {
    case 'task_queued':
      return 'Task queued';
    case 'task_started':
      return 'Task started';
    case 'runs_linked':
      return 'Runs linked';
    case 'run_queued':
      return 'Run queued';
    case 'run_started':
      return 'Run started';
    case 'run_completed':
      return 'Run completed';
    case 'run_failed':
      return 'Run failed';
    case 'task_ready_for_review':
      return 'Ready for review';
    case 'task_failed':
      return 'Task failed';
    case 'task_approved':
      return 'Task approved';
    case 'task_changes_requested':
      return 'Changes requested';
    case 'task_dismissed':
      return 'Task dismissed';
    case 'output_kept':
      return 'Output kept';
    case 'output_unkept':
      return 'Output removed from keep';
    case 'output_trashed':
      return 'Output trashed';
    default:
      return event.type.replaceAll('_', ' ');
  }
}

export function getWorkspaceEventMessage(event: TaskEvent): string | null {
  const message = event.payload?.message;
  if (typeof message === 'string' && message.trim().length > 0) {
    return message;
  }

  const summary = event.payload?.summary;
  if (typeof summary === 'string' && summary.trim().length > 0) {
    return summary;
  }

  const resultPreview = event.payload?.resultPreview;
  if (typeof resultPreview === 'string' && resultPreview.trim().length > 0) {
    return resultPreview;
  }

  const reason = event.payload?.reason;
  if (typeof reason === 'string' && reason.trim().length > 0) {
    return reason;
  }

  const error = event.payload?.error;
  if (typeof error === 'string' && error.trim().length > 0) {
    return error;
  }

  return null;
}
