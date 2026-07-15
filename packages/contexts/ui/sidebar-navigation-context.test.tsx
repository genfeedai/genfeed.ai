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
  const {
    activeGroupId,
    activePageLabel,
    breadcrumbPageLabel,
    breadcrumbRootLabel,
    groups,
  } = useSidebarNavigation();
  return (
    <span>
      {[
        activeGroupId || 'none',
        activePageLabel || 'none',
        breadcrumbRootLabel || 'none',
        breadcrumbPageLabel || 'none',
        groups.length,
      ].join('|')}
    </span>
  );
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

    expect(
      screen.getByText('none|Dashboard|none|Dashboard|1'),
    ).toBeInTheDocument();
  });

  it.each([
    ['/acme/brand/studio/video', '/studio', '/studio/video', 'Video'],
    [
      '/acme/brand/analytics/insights',
      '/analytics',
      '/analytics/insights',
      'Insights',
    ],
    ['/acme/brand/workspace/inbox', '/workspace', '/workspace/inbox', 'Inbox'],
    ['/acme/brand/compose/post', '/compose', '/compose/post', 'Post'],
  ])('prefers the most specific match for %s', (pathname, rootPath, childPath, childLabel) => {
    pathnameState.value = pathname;

    renderNavigation([
      {
        href: `${rootPath}/overview`,
        label: 'Overview',
        matchPaths: [rootPath],
      },
      {
        href: childPath,
        label: childLabel,
        matchPaths: [childPath],
      },
    ]);

    expect(
      screen.getByText(`none|${childLabel}|none|${childLabel}|1`),
    ).toBeInTheDocument();
  });

  it('ignores task-context query parameters when matching menu hrefs', () => {
    pathnameState.value = '/acme/brand/library/images';

    renderNavigation([
      {
        href: '/library/images?taskId=task-1',
        label: 'Images',
      },
    ]);

    expect(screen.getByText('none|Images|none|Images|1')).toBeInTheDocument();
  });

  it('preserves exact matching for root items with sibling pages', () => {
    pathnameState.value = '/acme/~/settings/members';

    renderNavigation([
      { href: '/settings', isExactMatch: true, label: 'General' },
      { href: '/settings/members', label: 'Members' },
    ]);

    expect(screen.getByText('none|Members|none|Members|1')).toBeInTheDocument();
  });

  it('uses canonical route breadcrumbs without discarding sidebar groups', () => {
    pathnameState.value = '/acme/brand/library/moodboard';

    render(
      <SidebarNavigationProvider
        breadcrumb={{ leafLabel: 'Moodboard', rootLabel: 'Library' }}
        items={[
          { group: 'Assets', href: '/library/images', label: 'Images' },
          { group: 'Assets', href: '/library/videos', label: 'Videos' },
        ]}
      >
        <NavigationState />
      </SidebarNavigationProvider>,
    );

    expect(
      screen.getByText('Assets|none|Library|Moodboard|1'),
    ).toBeInTheDocument();
  });
});
