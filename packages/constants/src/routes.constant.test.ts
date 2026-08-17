import { describe, expect, it } from 'vitest';
import {
  APP_ROUTE_PREFIXES,
  APP_ROUTE_TEMPLATES,
  APP_ROUTES,
  ARTIFACT_EDITOR_KIND_PARAM,
  createArtifactEditorRoute,
  createBrandAppRoute,
  createOrganizationAppRoute,
  createPlatformHomeRoute,
  LEGACY_APP_ROUTES,
  resolveArtifactEditorBackHref,
  withArtifactEditorReturn,
  withPlatformQuery,
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

  it('keeps legacy long-form aliases separate from the project editor', () => {
    expect(APP_ROUTES.EDIT.ROOT).toBe('/edit');
    expect(APP_ROUTES.EDIT.ARTICLE).toBe('/edit/article');
    expect(APP_ROUTES.EDIT.NEWSLETTER).toBe('/edit/newsletter');
    expect(APP_ROUTES.PUBLISH.POSTS).toBe('/publish/posts');
    expect(APP_ROUTES.STUDIO.EDIT).toBe('/studio/edit');
  });

  it('keeps the retired Publish newsletters path compatibility-only', () => {
    expect(LEGACY_APP_ROUTES.PUBLISH_NEWSLETTERS).toBe('/publish/newsletters');
    expect(APP_ROUTES.AGENT.NEW).toBe('/agent/new');
    expect('NEWSLETTERS' in APP_ROUTES.PUBLISH).toBe(false);
  });

  it('does not keep a /automate/strategies route', () => {
    expect('STRATEGIES' in APP_ROUTES.AUTOMATE).toBe(false);
    expect(APP_ROUTES.AUTOMATE.AUTOPILOT).toBe('/automate/autopilot');
  });

  it('keeps the retired cron-jobs lab path compatibility-only', () => {
    expect(LEGACY_APP_ROUTES.LAB_CRON_JOBS).toBe('/lab/cron-jobs');
    expect(APP_ROUTES.AUTOMATE.WORKFLOWS).toBe('/automate/workflows');
  });

  it('builds canonical Publish editor paths without a kind query param', () => {
    // Kind lives on the entity (which table the id hits), not the URL.
    expect(ARTIFACT_EDITOR_KIND_PARAM).toBe('kind');
    expect(createArtifactEditorRoute('article', 'article-1')).toBe(
      '/publish/posts/article-1',
    );
    expect(createArtifactEditorRoute('newsletter', 'newsletter-1')).toBe(
      '/publish/posts/newsletter-1',
    );
    expect(createArtifactEditorRoute('post', 'post-1')).toBe(
      '/publish/posts/post-1',
    );
    expect(
      createBrandAppRoute(
        'genfeed-ai',
        'paperclip',
        createArtifactEditorRoute('post', 'post-1'),
      ),
    ).toBe('/genfeed-ai/paperclip/publish/posts/post-1');
  });

  it('round-trips the originating list through the return parameter', () => {
    expect(
      withArtifactEditorReturn(
        '/genfeed-ai/paperclip/publish/posts/post-1',
        '/genfeed-ai/paperclip/publish/posts?status=draft',
      ),
    ).toBe(
      '/genfeed-ai/paperclip/publish/posts/post-1?returnTo=%2Fgenfeed-ai%2Fpaperclip%2Fpublish%2Fposts%3Fstatus%3Ddraft',
    );
    expect(
      resolveArtifactEditorBackHref(
        '/genfeed-ai/paperclip/publish?status=draft',
        '/genfeed-ai/paperclip/publish',
      ),
    ).toBe('/genfeed-ai/paperclip/publish?status=draft');

    expect(
      withArtifactEditorReturn(
        '/genfeed-ai/paperclip/publish/posts/article-1',
        '/genfeed-ai/paperclip/publish/posts',
      ),
    ).toBe(
      '/genfeed-ai/paperclip/publish/posts/article-1?returnTo=%2Fgenfeed-ai%2Fpaperclip%2Fpublish%2Fposts',
    );
  });

  it('falls back to the owning list for unusable return targets', () => {
    const fallbackHref = '/genfeed-ai/paperclip/publish';

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

  it('builds brand platform home paths and platform query filters', () => {
    expect(APP_ROUTES.PLATFORMS.ROOT).toBe('/platforms');
    expect(APP_ROUTE_PREFIXES.PLATFORMS).toBe('/platforms');
    expect(createPlatformHomeRoute('instagram')).toBe('/platforms/instagram');
    expect(createPlatformHomeRoute('google_ads')).toBe('/platforms/google_ads');
    expect(withPlatformQuery(APP_ROUTES.PUBLISH.SCHEDULED, 'instagram')).toBe(
      '/publish/scheduled?platform=instagram',
    );
    expect(
      withPlatformQuery(`${APP_ROUTES.PUBLISH.POSTS}?status=draft`, 'youtube'),
    ).toBe('/publish/posts?status=draft&platform=youtube');
  });

  it('keeps Tasks inside the Workspace route family', () => {
    expect(APP_ROUTES.WORKSPACE.TASKS).toBe('/workspace/tasks');
    expect(LEGACY_APP_ROUTES.TASKS).toBe('/tasks');
  });

  it('builds scoped brand and organization routes', () => {
    expect(APP_ROUTES.WORKSPACE.OVERVIEW).toBe('/workspace/overview');
    expect(APP_ROUTES.WORKSPACE.ROOT).toBe('/workspace');
    expect(
      createBrandAppRoute(
        'genfeed-ai',
        'paperclip',
        APP_ROUTES.WORKSPACE.OVERVIEW,
      ),
    ).toBe('/genfeed-ai/paperclip/workspace/overview');
    expect(
      createBrandAppRoute('genfeed-ai', 'paperclip', 'studio/storyboard'),
    ).toBe('/genfeed-ai/paperclip/studio/storyboard');
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
