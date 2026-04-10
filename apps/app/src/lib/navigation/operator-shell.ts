import type { WorkspaceTask } from '@services/workspace/workspace-tasks.service';

export type WorkspaceTaskLaunchMode =
  | 'auto'
  | 'automate'
  | 'edit'
  | 'generate'
  | 'write';

export const OPERATOR_TASK_CONTEXT_QUERY_KEYS = [
  'taskId',
  'taskTitle',
  'taskOutputType',
  'taskExecutionPath',
  'taskSource',
] as const;

const KNOWN_PROTECTED_PREFIXES = [
  'workspace',
  'studio',
  'settings',
  'agents',
  'posts',
  'analytics',
  'workflows',
  'library',
  'chat',
  'compose',
  'editor',
  'research',
  'issues',
  'overview',
  'ingredients',
  'videos',
  'edit',
  'orchestration',
  'elements',
  'bots',
  'admin',
] as const;

export function normalizeProtectedPathname(rawPathname: string): string {
  const parts = rawPathname.split('/').filter(Boolean);

  if (parts.length >= 3) {
    const thirdSegment = parts[2];

    if (
      parts[1] === '~' ||
      KNOWN_PROTECTED_PREFIXES.some((prefix) => prefix === thirdSegment)
    ) {
      const rest = parts[1] === '~' ? parts.slice(2) : parts.slice(2);
      return `/${rest.join('/')}`;
    }
  }

  return rawPathname;
}

export function pickOperatorTaskContextSearchParams(
  searchParams: URLSearchParams,
): URLSearchParams {
  const picked = new URLSearchParams();

  for (const key of OPERATOR_TASK_CONTEXT_QUERY_KEYS) {
    const value = searchParams.get(key);

    if (value) {
      picked.set(key, value);
    }
  }

  return picked;
}

export function appendSearchParamsToHref(
  href: string,
  searchParams: URLSearchParams,
): string {
  if ([...searchParams.keys()].length === 0) {
    return href;
  }

  const [pathWithoutHash, hash = ''] = href.split('#', 2);
  const [pathname, existingQuery = ''] = pathWithoutHash.split('?', 2);
  const mergedSearchParams = new URLSearchParams(existingQuery);

  for (const [key, value] of searchParams.entries()) {
    mergedSearchParams.set(key, value);
  }

  const queryString = mergedSearchParams.toString();
  const resolvedHash = hash ? `#${hash}` : '';

  return queryString
    ? `${pathname}?${queryString}${resolvedHash}`
    : `${pathname}${resolvedHash}`;
}

export function withTaskContextHref(
  href: string | undefined,
  searchParams: URLSearchParams,
): string | undefined {
  if (!href) {
    return href;
  }

  return appendSearchParamsToHref(href, searchParams);
}

function getWorkspaceTaskLaunchPath(
  task: WorkspaceTask,
  mode: WorkspaceTaskLaunchMode,
): string {
  if (mode === 'write') {
    if (task.outputType === 'newsletter') {
      return '/compose/newsletter';
    }

    return task.outputType === 'caption' || task.outputType === 'post'
      ? '/compose/post'
      : '/compose/article';
  }

  if (mode === 'generate') {
    return task.executionPathUsed === 'video_generation'
      ? '/studio/video'
      : '/studio/image';
  }

  if (mode === 'edit') {
    return '/editor';
  }

  if (mode === 'automate') {
    return '/workflows';
  }

  switch (task.executionPathUsed) {
    case 'caption_generation':
      return task.outputType === 'newsletter'
        ? '/compose/newsletter'
        : '/compose/post';
    case 'image_generation':
      return '/studio/image';
    case 'video_generation':
      return '/studio/video';
    default:
      return '/workflows';
  }
}

export function buildWorkspaceTaskLaunchHref(
  task: WorkspaceTask,
  mode: WorkspaceTaskLaunchMode = 'auto',
): string {
  const searchParams = new URLSearchParams({
    taskExecutionPath: task.executionPathUsed,
    taskId: task.id,
    taskOutputType: task.outputType,
    taskSource: 'workspace',
    taskTitle: task.title,
  });

  return appendSearchParamsToHref(
    getWorkspaceTaskLaunchPath(task, mode),
    searchParams,
  );
}
