import { describe, expect, it } from 'vitest';
import {
  APP_ROUTE_PREFIXES,
  APP_ROUTE_TEMPLATES,
  APP_ROUTES,
  ARTIFACT_EDITOR_TYPES,
  ARTIFACT_ROUTES,
  buildArtifactEditorRoute,
  createBrandAppRoute,
  createOrganizationAppRoute,
  isArtifactEditorType,
  LEGACY_APP_ROUTES,
} from './routes.constant';

function collectRouteValues(value: unknown): string[] {
  if (typeof value === 'string') {
    return [value];
  }

  if (!value || typeof value !== 'object') {
    return [];
  }

  return Object.values(value).flatMap((entry) => collectRouteValues(entry));
}

describe('routes.constant', () => {
  it('exports app route values as slash-prefixed paths', () => {
    for (const route of collectRouteValues(APP_ROUTES)) {
      expect(route.startsWith('/')).toBe(true);
    }
  });

  it('exports route prefixes as slash-prefixed paths', () => {
    for (const routePrefix of Object.values(APP_ROUTE_PREFIXES)) {
      expect(routePrefix.startsWith('/')).toBe(true);
    }
  });

  it('exposes the artifact editor prefix without an index route', () => {
    expect(ARTIFACT_ROUTES).toBe(APP_ROUTES.ARTIFACTS);
    expect(ARTIFACT_ROUTES.ROOT).toBe('/artifacts');
    expect(APP_ROUTE_PREFIXES.ARTIFACTS).toBe('/artifacts');
    expect(collectRouteValues(APP_ROUTES.ARTIFACTS)).toEqual(['/artifacts']);
  });

  it('retires the compose surface', () => {
    expect(
      collectRouteValues(APP_ROUTES).filter((route) =>
        route.startsWith('/compose'),
      ),
    ).toEqual([]);
  });

  it('builds deep links to a single artifact editor', () => {
    expect(buildArtifactEditorRoute('article', 'article-1')).toBe(
      '/artifacts/article/article-1',
    );
    expect(buildArtifactEditorRoute('newsletter', 'nl-2')).toBe(
      '/artifacts/newsletter/nl-2',
    );
    expect(buildArtifactEditorRoute('post', 'post-3')).toBe(
      '/artifacts/post/post-3',
    );
  });

  it('encodes artifact ids in editor deep links', () => {
    expect(buildArtifactEditorRoute('article', 'a b/c')).toBe(
      '/artifacts/article/a%20b%2Fc',
    );
  });

  it('recognizes only known artifact editor types', () => {
    for (const type of ARTIFACT_EDITOR_TYPES) {
      expect(isArtifactEditorType(type)).toBe(true);
      expect(buildArtifactEditorRoute(type, 'id-1')).toBe(
        `/artifacts/${type}/id-1`,
      );
    }

    expect(isArtifactEditorType('compose')).toBe(false);
    expect(isArtifactEditorType('video')).toBe(false);
  });

  it('documents canonical settings route templates', () => {
    expect(APP_ROUTE_TEMPLATES.PERSONAL_SETTINGS).toBe('/settings');
    expect(APP_ROUTE_TEMPLATES.ORGANIZATION_SETTINGS).toBe(
      '/:orgSlug/~/settings',
    );
    expect(APP_ROUTE_TEMPLATES.BRAND_SETTINGS).toBe(
      '/:orgSlug/:brandSlug/settings',
    );
  });

  it('keeps Tasks inside the Workspace route family', () => {
    expect(APP_ROUTES.WORKSPACE.TASKS).toBe('/workspace/tasks');
    expect(LEGACY_APP_ROUTES.TASKS).toBe('/tasks');
  });

  it('builds scoped brand and organization routes', () => {
    expect(
      createBrandAppRoute(
        'genfeed-ai',
        'paperclip',
        APP_ROUTES.WORKSPACE.OVERVIEW,
      ),
    ).toBe('/genfeed-ai/paperclip/workspace');
    expect(createBrandAppRoute('genfeed-ai', 'paperclip', 'studio/image')).toBe(
      '/genfeed-ai/paperclip/studio/image',
    );
    expect(createBrandAppRoute('genfeed-ai', 'paperclip')).toBe(
      '/genfeed-ai/paperclip',
    );
    expect(
      createOrganizationAppRoute('genfeed-ai', APP_ROUTES.SETTINGS.ROOT),
    ).toBe('/genfeed-ai/~/settings');
    expect(
      createOrganizationAppRoute('genfeed-ai', APP_ROUTES.OVERVIEW.ROOT),
    ).toBe('/genfeed-ai/~/overview');
    expect(createOrganizationAppRoute('genfeed-ai', 'billing')).toBe(
      '/genfeed-ai/~/billing',
    );
    expect(createOrganizationAppRoute('genfeed-ai')).toBe('/genfeed-ai/~');
  });
});
