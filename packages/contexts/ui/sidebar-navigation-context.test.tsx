import type { MenuItemConfig } from '@genfeedai/interfaces/ui/menu-config.interface';
import { render, screen } from '@testing-library/react';

import {
  SidebarNavigationProvider,
  useSidebarNavigation,
} from './sidebar-navigation-context';

const pathnameState = vi.hoisted(() => ({ value: '/workspace' }));

vi.mock('next/navigation', () => ({
  usePathname: () => pathnameState.value,
}));

function NavigationState() {
  const { activePageLabel } = useSidebarNavigation();
  return <span>{activePageLabel || 'none'}</span>;
}

function renderNavigation(items: MenuItemConfig[]) {
  return render(
    <SidebarNavigationProvider items={items}>
      <NavigationState />
    </SidebarNavigationProvider>,
  );
}

describe('SidebarNavigationProvider', () => {
  it('uses explicit match paths to derive the active breadcrumb page', () => {
    pathnameState.value = '/acme/brand/workspace';

    renderNavigation([
      {
        href: '/workspace/overview',
        label: 'Dashboard',
        matchPaths: ['/workspace', '/workspace/overview'],
      },
    ]);

    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  it('ignores task-context query parameters when matching menu hrefs', () => {
    pathnameState.value = '/acme/brand/library/images';

    renderNavigation([
      {
        href: '/library/images?taskId=task-1',
        label: 'Images',
      },
    ]);

    expect(screen.getByText('Images')).toBeInTheDocument();
  });

  it('preserves exact matching for root items with sibling pages', () => {
    pathnameState.value = '/acme/~/settings/members';

    renderNavigation([
      { href: '/settings', isExactMatch: true, label: 'General' },
      { href: '/settings/members', label: 'Members' },
    ]);

    expect(screen.getByText('Members')).toBeInTheDocument();
  });
});
