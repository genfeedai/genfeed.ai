import { APP_ROUTES, COMPOSE_ROUTES } from '@genfeedai/constants';
import type { Task } from '@services/management/tasks.service';

export type TaskLaunchMode =
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
  'tasks',
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

export function getCurrentBrandScopedPath(pathname: string): string {
  const parts = pathname.split('/').filter(Boolean);

  if (parts.length >= 3 && parts[1] !== '~') {
    return `/${parts.slice(2).join('/')}`;
  }

  return APP_ROUTES.WORKSPACE.OVERVIEW;
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

function getTaskLaunchPath(task: Task, mode: TaskLaunchMode): string {
  if (mode === 'write') {
    if (task.outputType === 'newsletter') {
      return COMPOSE_ROUTES.NEWSLETTER;
    }

    return task.outputType === 'caption' || task.outputType === 'post'
      ? COMPOSE_ROUTES.POST
      : COMPOSE_ROUTES.ARTICLE;
  }

  if (mode === 'generate') {
    return task.executionPathUsed === 'video_generation'
      ? APP_ROUTES.STUDIO.VIDEO
      : APP_ROUTES.STUDIO.IMAGE;
  }

  if (mode === 'edit') {
    return APP_ROUTES.EDITOR.ROOT;
  }

  if (mode === 'automate') {
    return APP_ROUTES.WORKFLOWS.ROOT;
  }

  switch (task.executionPathUsed) {
    case 'caption_generation':
      return task.outputType === 'newsletter'
        ? COMPOSE_ROUTES.NEWSLETTER
        : COMPOSE_ROUTES.POST;
    case 'image_generation':
      return APP_ROUTES.STUDIO.IMAGE;
    case 'video_generation':
      return APP_ROUTES.STUDIO.VIDEO;
    default:
      return APP_ROUTES.WORKFLOWS.ROOT;
  }
}

export function buildTaskLaunchHref(
  task: Task,
  mode: TaskLaunchMode = 'auto',
): string {
  const searchParams = new URLSearchParams({
    taskExecutionPath: task.executionPathUsed ?? '',
    taskId: task.id,
    taskOutputType: task.outputType ?? '',
    taskSource: 'workspace',
    taskTitle: task.title,
  });

  return appendSearchParamsToHref(getTaskLaunchPath(task, mode), searchParams);
}
