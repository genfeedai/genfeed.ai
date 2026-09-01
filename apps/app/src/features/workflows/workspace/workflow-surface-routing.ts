const WORKFLOW_RESERVED_SEGMENTS = new Set(['library', 'templates']);

export interface WorkflowSurfaceRouteSelection {
  readonly executionId: string | null;
  readonly isGraphCanvas: boolean;
  readonly runsBaseHref: string | null;
  readonly workflowBaseHref: string | null;
  readonly workflowId: string | null;
}

export function resolveWorkflowSurfaceRoute(
  pathname: string,
  searchParams: URLSearchParams,
): WorkflowSurfaceRouteSelection {
  const segments = pathname.split('/').filter(Boolean);
  const automationIndex = segments.indexOf('automation');
  const workflowsIndex = segments.indexOf('workflows');
  const runsIndex = segments.indexOf('runs');
  const isTemplatesRoute = segments[automationIndex + 1] === 'templates';
  if (workflowsIndex < 0 && runsIndex < 0 && !isTemplatesRoute) {
    return {
      executionId: null,
      isGraphCanvas: false,
      runsBaseHref: null,
      workflowBaseHref: null,
      workflowId: null,
    };
  }

  const automationBaseHref = `/${segments
    .slice(0, automationIndex + 1)
    .join('/')}`;
  const runsBaseHref = `${automationBaseHref}/runs`;
  const workflowBaseHref = `${automationBaseHref}/workflows`;

  if (runsIndex >= 0) {
    return {
      executionId: segments[runsIndex + 1] ?? null,
      isGraphCanvas: false,
      runsBaseHref,
      workflowBaseHref,
      workflowId: null,
    };
  }

  if (isTemplatesRoute) {
    return {
      executionId: null,
      isGraphCanvas: false,
      runsBaseHref,
      workflowBaseHref,
      workflowId: null,
    };
  }

  const section = segments[workflowsIndex + 1];

  const workflowId =
    section && section !== 'new' && !WORKFLOW_RESERVED_SEGMENTS.has(section)
      ? section
      : null;

  return {
    executionId: searchParams.get('execution'),
    isGraphCanvas: section === 'new' || Boolean(workflowId),
    runsBaseHref,
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
