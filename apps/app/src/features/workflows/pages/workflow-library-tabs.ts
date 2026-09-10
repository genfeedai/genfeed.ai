import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { TabsProps } from '@props/ui/navigation/tabs.props';

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
