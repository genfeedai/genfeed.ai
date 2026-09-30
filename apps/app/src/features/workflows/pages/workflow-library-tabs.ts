import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { TabsProps } from '@props/ui/navigation/tabs.props';

export type WorkflowCollectionView = 'library' | 'templates';

type WorkflowRouteQuery = Record<string, string | string[] | undefined>;

/** Anything other than `templates` is the Library, including a bare route. */
export function parseWorkflowCollectionView(
  value: string | string[] | undefined,
): WorkflowCollectionView {
  return (Array.isArray(value) ? value[0] : value) === 'templates'
    ? 'templates'
    : 'library';
}

/**
 * Templates is a view of the Workflows page, not a route of its own:
 * `/automation/workflows?view=templates`. Extra query (e.g. `template`) rides
 * along after the view.
 */
export function workflowTemplatesTabPath(
  query: WorkflowRouteQuery = {},
): string {
  const params = new URLSearchParams({ view: 'templates' });
  for (const [key, value] of Object.entries(query)) {
    if (key === 'view') continue;
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item) params.append(key, item);
    }
  }
  return `${APP_ROUTES.AUTOMATION.WORKFLOWS}?${params.toString()}`;
}

export function workflowCollectionHeaderTabs(
  href: (path: string) => string,
): TabsProps {
  return {
    ariaLabel: 'Workflow collection',
    fullWidth: false,
    tabs: [
      {
        href: href(APP_ROUTES.AUTOMATION.WORKFLOWS),
        id: 'library',
        label: 'Library',
        matchMode: 'exact',
      },
      {
        href: href(workflowTemplatesTabPath()),
        id: 'templates',
        label: 'Templates',
        matchMode: 'exact',
      },
    ],
  };
}
