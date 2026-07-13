const WORKFLOW_RESERVED_SEGMENTS = new Set([
  'executions',
  'library',
  'templates',
]);

export interface WorkflowSurfaceRouteSelection {
  readonly executionId: string | null;
  readonly isGraphCanvas: boolean;
  readonly workflowBaseHref: string | null;
  readonly workflowId: string | null;
}

export function resolveWorkflowSurfaceRoute(
  pathname: string,
  searchParams: URLSearchParams,
): WorkflowSurfaceRouteSelection {
  const segments = pathname.split('/').filter(Boolean);
  const workflowsIndex = segments.indexOf('workflows');
  if (workflowsIndex < 0) {
    return {
      executionId: null,
      isGraphCanvas: false,
      workflowBaseHref: null,
      workflowId: null,
    };
  }

  const workflowBaseHref = `/${segments
    .slice(0, workflowsIndex + 1)
    .join('/')}`;
  const section = segments[workflowsIndex + 1];
  const detailId = segments[workflowsIndex + 2];

  if (section === 'executions') {
    return {
      executionId: detailId ?? null,
      isGraphCanvas: false,
      workflowBaseHref,
      workflowId: null,
    };
  }

  const workflowId =
    section && section !== 'new' && !WORKFLOW_RESERVED_SEGMENTS.has(section)
      ? section
      : null;

  return {
    executionId: searchParams.get('execution'),
    isGraphCanvas: section === 'new' || Boolean(workflowId),
    workflowBaseHref,
    workflowId,
  };
}

export function appendWorkflowThread(
  href: string,
  threadId: string | null,
): string {
  if (!threadId) {
    return href;
  }

  const url = new URL(href, 'https://workspace.genfeed.invalid');
  url.searchParams.set('thread', threadId);
  return `${url.pathname}${url.search}${url.hash}`;
}
