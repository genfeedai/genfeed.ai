import type { MenuItemConfig } from '@genfeedai/contracts/interfaces/ui/menu-config.interface';
import { render, screen } from '@testing-library/react';

import {
  SidebarNavigationProvider,
  useSidebarNavigation,
} from './sidebar-navigation-context';

const pathnameState = vi.hoisted(() => ({ value: '/workspace' }));
const searchParamsState = vi.hoisted(() => ({ value: '' }));

vi.mock('next/navigation', () => ({
  usePathname: () => pathnameState.value,
  useSearchParams: () => new URLSearchParams(searchParamsState.value),
}));

function NavigationState() {
  const {
    activeGroupId,
    activePageLabel,
    breadcrumbPageLabel,
    breadcrumbRootLabel,
    groups,
    hasCanonicalBreadcrumb,
  } = useSidebarNavigation();
  return (
    <span>
      {[
        activeGroupId || 'none',
        activePageLabel || 'none',
        breadcrumbRootLabel || 'none',
        breadcrumbPageLabel || 'none',
        hasCanonicalBreadcrumb ? 'canonical' : 'derived',
        groups.length,
      ].join('|')}
    </span>
  );
}

function BreadcrumbParentState() {
  const { breadcrumbParentLabel } = useSidebarNavigation();

  return <span>{breadcrumbParentLabel || 'none'}</span>;
}

function renderNavigation(items: MenuItemConfig[]) {
  return render(
    <SidebarNavigationProvider items={items}>
      <NavigationState />
    </SidebarNavigationProvider>,
  );
}

describe('SidebarNavigationProvider', () => {
  beforeEach(() => {
    searchParamsState.value = '';
  });

  it('uses explicit match paths to derive the active breadcrumb page', () => {
    pathnameState.value = '/acme/brand/workspace';

    renderNavigation([
      {
        href: '/workspace',
        label: 'Dashboard',
        matchPaths: ['/workspace', '/workspace'],
      },
    ]);

    expect(
      screen.getByText('none|Dashboard|none|Dashboard|derived|1'),
    ).toBeInTheDocument();
  });

  it.each([
    [
      '/acme/brand/studio/storyboard',
      '/studio',
      '/studio/storyboard',
      'Storyboard',
    ],
    [
      '/acme/brand/analytics/insights',
      '/analytics',
      '/analytics/insights',
      'Insights',
    ],
    ['/acme/brand/workspace/inbox', '/workspace', '/workspace/inbox', 'Inbox'],
    [
      '/acme/brand/publishing/posts/post-1',
      '/publishing',
      '/publishing/posts',
      'Post',
    ],
  ])(
    'prefers the most specific match for %s',
    (pathname, rootPath, childPath, childLabel) => {
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
        screen.getByText(`none|${childLabel}|none|${childLabel}|derived|1`),
      ).toBeInTheDocument();
    },
  );

  it('ignores task-context query parameters when matching menu hrefs', () => {
    pathnameState.value = '/acme/brand/library/images';

    renderNavigation([
      {
        href: '/library/images?taskId=task-1',
        label: 'Images',
      },
    ]);

    expect(
      screen.getByText('none|Images|none|Images|derived|1'),
    ).toBeInTheDocument();
  });

  it('prefers a query-specific Pipeline item over the generic Posts item', () => {
    pathnameState.value = '/acme/brand/publishing/posts';
    searchParamsState.value = 'publicationState=posted&platform=linkedin';

    renderNavigation([
      { href: '/publishing/posts', label: 'Posts' },
      {
        group: 'Pipeline',
        href: '/publishing/posts?publicationState=not-posted',
        label: 'Drafts',
        matchSearchParams: {
          publicationState: 'not-posted',
          status: null,
        },
      },
      {
        group: 'Pipeline',
        href: '/publishing/posts?publicationState=posted',
        label: 'Published',
        matchSearchParams: { publicationState: 'posted', status: null },
      },
    ]);

    expect(
      screen.getByText('Pipeline|Published|Pipeline|Published|derived|2'),
    ).toBeInTheDocument();
  });

  it('preserves exact matching for root items with sibling pages', () => {
    pathnameState.value = '/acme/~/settings/members';

    renderNavigation([
      { href: '/settings', isExactMatch: true, label: 'General' },
      { href: '/settings/members', label: 'Members' },
    ]);

    expect(
      screen.getByText('none|Members|none|Members|derived|1'),
    ).toBeInTheDocument();
  });

  it('uses canonical route breadcrumbs without discarding sidebar groups', () => {
    pathnameState.value = '/acme/brand/library/starred';

    render(
      <SidebarNavigationProvider
        breadcrumb={{ leafLabel: 'Starred', rootLabel: 'Library' }}
        items={[
          { group: 'Assets', href: '/library/images', label: 'Images' },
          { group: 'Assets', href: '/library/videos', label: 'Videos' },
        ]}
      >
        <NavigationState />
      </SidebarNavigationProvider>,
    );

    expect(
      screen.getByText('Assets|none|Library|Starred|canonical|1'),
    ).toBeInTheDocument();
  });

  it('forwards the optional canonical breadcrumb parent', () => {
    pathnameState.value = '/acme/brand/discovery/ads/google';

    render(
      <SidebarNavigationProvider
        breadcrumb={{
          leafLabel: 'Google',
          parentLabel: 'Ads',
          rootLabel: 'Discovery',
        }}
        items={[]}
      >
        <BreadcrumbParentState />
      </SidebarNavigationProvider>,
    );

    expect(screen.getByText('Ads')).toBeInTheDocument();
  });

  it('treats a permanent shell topbar as canonical page identity without route metadata', () => {
    pathnameState.value = '/acme/~/settings/api-keys';

    render(
      <SidebarNavigationProvider
        hasCanonicalPageIdentity
        items={[{ href: '/settings/api-keys', label: 'API Keys' }]}
      >
        <NavigationState />
      </SidebarNavigationProvider>,
    );

    expect(
      screen.getByText('none|API Keys|none|API Keys|canonical|1'),
    ).toBeInTheDocument();
  });
});
