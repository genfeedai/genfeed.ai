import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { TabsProps } from '@props/ui/navigation/tabs.props';

export function batchCollectionHeaderTabs(
  href: (path: string) => string,
): TabsProps {
  return {
    ariaLabel: 'Batch collection',
    fullWidth: false,
    tabs: [
      {
        href: href(APP_ROUTES.STUDIO.BATCH_NEW),
        id: 'new',
        label: 'New',
        matchMode: 'exact',
        matchPaths: [
          href(APP_ROUTES.STUDIO.BATCH),
          href(APP_ROUTES.STUDIO.BATCH_NEW),
        ],
      },
      {
        href: href(APP_ROUTES.STUDIO.BATCH_HISTORY),
        id: 'history',
        label: 'History',
        matchMode: 'prefix',
      },
    ],
  };
}

export function isBatchHistoryPath(pathname: string): boolean {
  return pathname.includes('/studio/batch/history');
}
