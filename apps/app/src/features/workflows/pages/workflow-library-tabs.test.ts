import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { describe, expect, it } from 'vitest';
import { workflowCollectionHeaderTabs } from './workflow-library-tabs';

describe('workflowCollectionHeaderTabs', () => {
  it('points Library and Templates at the same workflows surface', () => {
    const href = (path: string) => `/acme/moonrise${path}`;
    const tabs = workflowCollectionHeaderTabs(href).tabs;

    expect(tabs).toEqual([
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
    ]);
  });
});
