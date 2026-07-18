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
  'agent',
  'messages',
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

/**
 * First-asset unlock gate — the main app sections that are soft-locked until the
 * org generates its first asset. Values are normalized app-relative prefixes
 * (post-{@link normalizeProtectedPathname}), so pass a normalized pathname.
 *
 * Covers the five product sections plus their canonical route aliases: Workspace
 * (`/workspace`, `/overview`, `/tasks`), Library, Analytics, Workflows
 * (`/workflows`, `/orchestration`), and the Calendar (`/posts/calendar`). The
 * agent, settings, studio, compose, research, publish, messages, and admin
 * surfaces are intentionally NOT gated.
 */
const ASSET_GATE_SECTION_PREFIXES = [
  '/workspace',
  '/overview',
  '/tasks',
  '/library',
  '/analytics',
  '/workflows',
  '/orchestration',
  '/posts/calendar',
] as const;

export function isAssetGateSectionPath(normalizedPathname: string): boolean {
  return ASSET_GATE_SECTION_PREFIXES.some(
    (prefix) =>
      normalizedPathname === prefix ||
      normalizedPathname.startsWith(`${prefix}/`),
  );
}

export function getCurrentBrandScopedPath(pathname: string): string {
  const parts = pathname.split('/').filter(Boolean);

  if (parts.length >= 3 && parts[1] !== '~') {
    return `/${parts.slice(2).join('/')}`;
  }

  return APP_ROUTES.WORKSPACE.OVERVIEW;
}

export function getBrandSwitchHref({
  nextBrandSlug,
  nextOrgSlug,
  pathname,
}: {
  nextBrandSlug: string;
  nextOrgSlug: string;
  pathname: string;
}): string {
  const parts = pathname.split('/').filter(Boolean);

  if (parts.length >= 3 && parts[1] === '~') {
    return `/${nextOrgSlug}/~/${parts.slice(2).join('/')}`;
  }

  return `/${nextOrgSlug}/${nextBrandSlug}${getCurrentBrandScopedPath(pathname)}`;
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

type TaskLaunchCapabilities = {
  studio: boolean;
};

function getTaskLaunchPath(
  task: Task,
  mode: TaskLaunchMode,
  capabilities: TaskLaunchCapabilities,
): string {
  if (mode === 'write') {
    if (task.outputType === 'newsletter') {
      return COMPOSE_ROUTES.NEWSLETTER;
    }

    return task.outputType === 'caption' || task.outputType === 'post'
      ? COMPOSE_ROUTES.POST
      : COMPOSE_ROUTES.ARTICLE;
  }

  if (mode === 'generate') {
    if (!capabilities.studio) {
      return APP_ROUTES.AGENT.NEW;
    }

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
      return capabilities.studio
        ? APP_ROUTES.STUDIO.IMAGE
        : APP_ROUTES.AGENT.NEW;
    case 'video_generation':
      return capabilities.studio
        ? APP_ROUTES.STUDIO.VIDEO
        : APP_ROUTES.AGENT.NEW;
    default:
      return APP_ROUTES.WORKFLOWS.ROOT;
  }
}

export function buildTaskLaunchHref(
  task: Task,
  mode: TaskLaunchMode = 'auto',
  capabilities: TaskLaunchCapabilities = { studio: true },
): string {
  const searchParams = new URLSearchParams({
    taskExecutionPath: task.executionPathUsed ?? '',
    taskId: task.id,
    taskOutputType: task.outputType ?? '',
    taskSource: 'workspace',
    taskTitle: task.title,
  });

  return appendSearchParamsToHref(
    getTaskLaunchPath(task, mode, capabilities),
    searchParams,
  );
}
