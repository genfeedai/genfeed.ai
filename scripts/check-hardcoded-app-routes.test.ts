import { describe, expect, it } from 'vitest';
import { findAdminRouteContainmentViolations } from './check-hardcoded-app-routes';

const ADMIN_FILE =
  'apps/app/app/(protected)/admin/content/example/example-page.tsx';

describe('admin route containment guard', () => {
  it('accepts admin routes and central route constants', () => {
    const source = `
      <Link href="/admin/content/posts" />
      <Link href={APP_ROUTES.ADMIN.CONTENT.POSTS} />
      push(APP_ROUTES.ADMIN.CONTENT.POSTS);
    `;

    expect(findAdminRouteContainmentViolations(source, ADMIN_FILE)).toEqual([]);
  });

  it('rejects links and navigation calls that escape the admin route family', () => {
    const source = `
      <Link href={\`/templates/\${template.id}\`} />
      const tabs = [{ href: '/tags/all', label: 'All' }];
      redirect('/configuration/tags/all');
    `;

    expect(findAdminRouteContainmentViolations(source, ADMIN_FILE)).toEqual([
      {
        file: ADMIN_FILE,
        line: 2,
        path: '/templates/$' + '{template.id}',
      },
      {
        file: ADMIN_FILE,
        line: 3,
        path: '/tags/all',
      },
      {
        file: ADMIN_FILE,
        line: 4,
        path: '/configuration/tags/all',
      },
    ]);
  });

  it('rejects non-admin base paths and pathname comparisons', () => {
    const source = `
      const isListRoute = pathname === '/content/posts';
      <AnalyticsOverview basePath="/analytics" />
    `;

    expect(findAdminRouteContainmentViolations(source, ADMIN_FILE)).toEqual([
      {
        file: ADMIN_FILE,
        line: 2,
        path: '/content/posts',
      },
      {
        file: ADMIN_FILE,
        line: 3,
        path: '/analytics',
      },
    ]);
  });
});
