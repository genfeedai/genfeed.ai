import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { TabsProps } from '@props/ui/navigation/tabs.props';

type WorkflowRouteQuery = Record<string, string | string[] | undefined>;

/**
 * Templates lives at `/automation/workflows/templates`. Extra query (e.g.
 * `template`, which starts creating from that template) rides along.
 */
export function workflowTemplatesTabPath(
  query: WorkflowRouteQuery = {},
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item) params.append(key, item);
    }
  }
  const search = params.toString();
  return search
    ? `${APP_ROUTES.AUTOMATION.WORKFLOWS_TEMPLATES}?${search}`
    : APP_ROUTES.AUTOMATION.WORKFLOWS_TEMPLATES;
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
        href: href(APP_ROUTES.AUTOMATION.WORKFLOWS_TEMPLATES),
        id: 'templates',
        label: 'Templates',
        matchMode: 'exact',
      },
    ],
  };
}
