import { describe, expect, it } from 'vitest';
import {
  ROUTE_MANIFEST_ADMIN_CATEGORIES,
  ROUTE_MANIFEST_ADMIN_PAGES,
  ROUTE_MANIFEST_APPS,
} from './route-manifest.constant';
import { APP_ROUTE_PREFIXES } from './routes.constant';

describe('route manifest apps', () => {
  it('roots every rail app at a product route prefix', () => {
    const prefixes = new Set<string>(Object.values(APP_ROUTE_PREFIXES));

    expect(
      ROUTE_MANIFEST_APPS.filter((app) => !prefixes.has(app.rootPath)).map(
        (app) => app.id,
      ),
    ).toEqual([]);
  });

  it('keeps each app home and bare-root redirect inside the app', () => {
    const outside = ROUTE_MANIFEST_APPS.flatMap((app) =>
      [app.homePath, app.bareRootRedirect]
        .filter((path): path is string => path !== undefined)
        .filter((path) => !path.startsWith(app.rootPath))
        .map((path) => `${app.id}: ${path}`),
    );

    expect(outside).toEqual([]);
  });
});

describe('route manifest admin', () => {
  it('lists every sidebar page under a category that has a rail icon', () => {
    const categories = new Set<string>(
      ROUTE_MANIFEST_ADMIN_CATEGORIES.map((category) => category.id),
    );

    expect(
      ROUTE_MANIFEST_ADMIN_PAGES.flatMap((page) =>
        page.menu && !categories.has(page.menu.category) ? [page.path] : [],
      ),
    ).toEqual([]);
  });

  it('gives each sidebar entry its own id', () => {
    const ids = ROUTE_MANIFEST_ADMIN_PAGES.flatMap((page) =>
      page.menu ? [page.menu.id] : [],
    );

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps every admin page under /admin', () => {
    expect(
      ROUTE_MANIFEST_ADMIN_PAGES.filter(
        (page) => !page.path.startsWith('/admin'),
      ),
    ).toEqual([]);
  });
});
