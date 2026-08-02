import { describe, expect, it } from 'vitest';
import {
  APP_ROUTE_PREFIXES,
  APP_ROUTE_TEMPLATES,
  APP_ROUTES,
  COMPOSE_ROUTES,
  createArtifactEditorRoute,
  createBrandAppRoute,
  createOrganizationAppRoute,
  LEGACY_APP_ROUTES,
  resolveArtifactEditorBackHref,
  withArtifactEditorReturn,
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

  it('keeps compose routes compatible with the previous constant shape', () => {
    expect(COMPOSE_ROUTES).toBe(APP_ROUTES.COMPOSE);
    expect(COMPOSE_ROUTES.ARTICLE).toBe('/compose/article');
    expect(COMPOSE_ROUTES.NEWSLETTER).toBe('/compose/newsletter');
    expect(COMPOSE_ROUTES.POST).toBe('/compose/post');
    expect(COMPOSE_ROUTES.ROOT).toBe('/compose');
  });

  it('exposes dedicated artifact editor routes separate from the project editor', () => {
    expect(APP_ROUTES.EDIT.ROOT).toBe('/edit');
    expect(APP_ROUTES.EDIT.ARTICLE).toBe('/edit/article');
    expect(APP_ROUTES.EDIT.NEWSLETTER).toBe('/edit/newsletter');
    expect(APP_ROUTES.EDIT.POST).toBe('/edit/post');
    expect(APP_ROUTES.EDITOR.ROOT).toBe('/editor');
  });

  it('builds deep-linkable artifact editor paths', () => {
    expect(createArtifactEditorRoute('article', 'article-1')).toBe(
      '/edit/article/article-1',
    );
    expect(createArtifactEditorRoute('newsletter', 'newsletter-1')).toBe(
      '/edit/newsletter/newsletter-1',
    );
    expect(createArtifactEditorRoute('post', 'post-1')).toBe(
      '/edit/post/post-1',
    );
    expect(
      createBrandAppRoute(
        'genfeed-ai',
        'paperclip',
        createArtifactEditorRoute('post', 'post-1'),
      ),
    ).toBe('/genfeed-ai/paperclip/edit/post/post-1');
  });

  it('round-trips the originating list through the return parameter', () => {
    expect(
      withArtifactEditorReturn(
        '/genfeed-ai/paperclip/edit/post/post-1',
        '/genfeed-ai/paperclip/posts?status=draft',
      ),
    ).toBe(
      '/genfeed-ai/paperclip/edit/post/post-1?returnTo=%2Fgenfeed-ai%2Fpaperclip%2Fposts%3Fstatus%3Ddraft',
    );
    expect(
      resolveArtifactEditorBackHref(
        '/genfeed-ai/paperclip/posts?status=draft',
        '/genfeed-ai/paperclip/posts',
      ),
    ).toBe('/genfeed-ai/paperclip/posts?status=draft');

    expect(
      withArtifactEditorReturn(
        '/genfeed-ai/paperclip/edit/post/post-1?mode=focus',
        '/genfeed-ai/paperclip/posts',
      ),
    ).toBe(
      '/genfeed-ai/paperclip/edit/post/post-1?mode=focus&returnTo=%2Fgenfeed-ai%2Fpaperclip%2Fposts',
    );
  });

  it('falls back to the owning list for unusable return targets', () => {
    const fallbackHref = '/genfeed-ai/paperclip/posts';

    expect(resolveArtifactEditorBackHref(null, fallbackHref)).toBe(
      fallbackHref,
    );
    expect(resolveArtifactEditorBackHref(undefined, fallbackHref)).toBe(
      fallbackHref,
    );
    expect(resolveArtifactEditorBackHref('', fallbackHref)).toBe(fallbackHref);
    expect(resolveArtifactEditorBackHref('//evil.com', fallbackHref)).toBe(
      fallbackHref,
    );
    expect(resolveArtifactEditorBackHref('/\\evil.com', fallbackHref)).toBe(
      fallbackHref,
    );
    expect(resolveArtifactEditorBackHref('/\\\\evil.com', fallbackHref)).toBe(
      fallbackHref,
    );
    expect(
      resolveArtifactEditorBackHref('https://evil.com/posts', fallbackHref),
    ).toBe(fallbackHref);
    expect(resolveArtifactEditorBackHref('posts', fallbackHref)).toBe(
      fallbackHref,
    );
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
