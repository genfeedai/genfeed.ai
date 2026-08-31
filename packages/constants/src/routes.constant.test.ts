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
  getOrgSwitchHref,
  isPersonalSettingsPath,
  isUserFacingAppPathname,
  LEGACY_APP_ROUTES,
  parseScopedAppPath,
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

  it.each([
    '/',
    '/onboarding/brand',
    '/oauth/cli',
    '/settings/personal',
    '/acme',
    '/acme/~',
    '/acme/moonrise/workspace/overview',
  ])('recognizes the user-facing auth continuation %s', (pathname) => {
    expect(isUserFacingAppPathname(pathname)).toBe(true);
  });

  it.each([
    '/api/version',
    '/%61pi/version',
    '/api%252Fversion',
    '/v1/auth/get-session',
    '/trpc/session',
    '/_next/static/app.js',
    '/serwist/sw.js',
    '/ingest',
    '/monitoring',
    '/robots.txt',
    '/.well-known/openid-configuration',
    '/acme/.well-known/workspace',
    '/login',
    '/logout',
    '/sign-up',
    '//evil.example/path',
    '/\\evil.example/path',
  ])('rejects the non-product auth continuation %s', (pathname) => {
    expect(isUserFacingAppPathname(pathname)).toBe(false);
  });

  it('keeps legacy long-form aliases separate from the project editor', () => {
    expect(APP_ROUTES.EDIT.ROOT).toBe('/edit');
    expect(APP_ROUTES.EDIT.ARTICLE).toBe('/edit/article');
    expect(APP_ROUTES.EDIT.NEWSLETTER).toBe('/edit/newsletter');
    expect(APP_ROUTES.PUBLISHING.POSTS).toBe('/publishing/posts');
    expect(APP_ROUTES.STUDIO.EDIT).toBe('/studio/edit');
  });

  it('keeps the retired Publishing newsletters path compatibility-only', () => {
    expect(LEGACY_APP_ROUTES.PUBLISHING_NEWSLETTERS).toBe(
      '/publishing/newsletters',
    );
    expect(APP_ROUTES.AGENT.NEW).toBe('/agent/new');
    expect('NEWSLETTERS' in APP_ROUTES.PUBLISHING).toBe(false);
  });

  it('does not keep a /automation/strategies route', () => {
    expect('STRATEGIES' in APP_ROUTES.AUTOMATION).toBe(false);
    expect(APP_ROUTES.AUTOMATION.AUTOPILOT).toBe('/automation/autopilot');
  });

  it('nests agent detail under the agents list', () => {
    expect(APP_ROUTES.AUTOMATION.AGENTS).toBe('/automation/agents');
    expect(APP_ROUTES.AUTOMATION.NEW).toBe('/automation/agents/new');
    expect(APP_ROUTES.AUTOMATION.LIBRARY).toBe('/automation/library');
  });

  it('keeps the retired cron-jobs lab path compatibility-only', () => {
    expect(LEGACY_APP_ROUTES.LAB_CRON_JOBS).toBe('/lab/cron-jobs');
    expect(APP_ROUTES.AUTOMATION.WORKFLOWS).toBe('/automation/workflows');
  });

  it('aliases /workflows onto Automation workflows instead of a new app', () => {
    expect(LEGACY_APP_ROUTES.WORKFLOWS).toBe('/workflows');
    expect(APP_ROUTES.AUTOMATION.WORKFLOWS).toBe('/automation/workflows');
    expect(APP_ROUTES.AUTOMATION.WORKFLOWS_TEMPLATES).toBe(
      '/automation/workflows/templates',
    );
  });

  it('builds canonical Publishing editor paths without a kind query param', () => {
    // Kind lives on the entity (which table the id hits), not the URL.
    expect(ARTIFACT_EDITOR_KIND_PARAM).toBe('kind');
    expect(createArtifactEditorRoute('article', 'article-1')).toBe(
      '/publishing/posts/article-1',
    );
    expect(createArtifactEditorRoute('newsletter', 'newsletter-1')).toBe(
      '/publishing/posts/newsletter-1',
    );
    expect(createArtifactEditorRoute('post', 'post-1')).toBe(
      '/publishing/posts/post-1',
    );
    expect(
      createBrandAppRoute(
        'genfeed-ai',
        'paperclip',
        createArtifactEditorRoute('post', 'post-1'),
      ),
    ).toBe('/genfeed-ai/paperclip/publishing/posts/post-1');
  });

  it('round-trips the originating list through the return parameter', () => {
    expect(
      withArtifactEditorReturn(
        '/genfeed-ai/paperclip/publishing/posts/post-1',
        '/genfeed-ai/paperclip/publishing/posts?status=draft',
      ),
    ).toBe(
      '/genfeed-ai/paperclip/publishing/posts/post-1?returnTo=%2Fgenfeed-ai%2Fpaperclip%2Fpublishing%2Fposts%3Fstatus%3Ddraft',
    );
    expect(
      resolveArtifactEditorBackHref(
        '/genfeed-ai/paperclip/publishing?status=draft',
        '/genfeed-ai/paperclip/publishing',
      ),
    ).toBe('/genfeed-ai/paperclip/publishing?status=draft');

    expect(
      withArtifactEditorReturn(
        '/genfeed-ai/paperclip/publishing/posts/article-1',
        '/genfeed-ai/paperclip/publishing/posts',
      ),
    ).toBe(
      '/genfeed-ai/paperclip/publishing/posts/article-1?returnTo=%2Fgenfeed-ai%2Fpaperclip%2Fpublishing%2Fposts',
    );
  });

  it('falls back to the owning list for unusable return targets', () => {
    const fallbackHref = '/genfeed-ai/paperclip/publishing';

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
    expect(APP_ROUTE_TEMPLATES.PERSONAL_SETTINGS).toBe('/settings/personal');
    expect(APP_ROUTE_TEMPLATES.ORGANIZATION_SETTINGS).toBe(
      '/:orgSlug/~/settings',
    );
    expect(APP_ROUTE_TEMPLATES.BRAND_SETTINGS).toBe(
      '/:orgSlug/:brandSlug/settings',
    );
    expect(APP_ROUTES.SETTINGS.GENERAL).toBe('/settings/general');
    expect(APP_ROUTES.SETTINGS.PERSONAL).toBe('/settings/personal');
  });

  it('keeps the current surface when switching organizations', () => {
    expect(getOrgSwitchHref('bravo', '/alpha/moonrise/library/assets')).toBe(
      '/bravo/~/library/assets',
    );
    expect(getOrgSwitchHref('bravo', '/alpha/~/agent/new')).toBe(
      '/bravo/~/agent/new',
    );
    expect(
      getOrgSwitchHref('bravo', '/alpha/moonrise/settings/publishing'),
    ).toBe('/bravo/~/settings/brands');
  });

  it('keeps personal settings children on the unscoped /settings shell', () => {
    expect(isPersonalSettingsPath('/settings')).toBe(true);
    expect(isPersonalSettingsPath('/settings/personal')).toBe(true);
    expect(isPersonalSettingsPath('/settings/notifications')).toBe(true);
    expect(isPersonalSettingsPath('/settings/progress')).toBe(true);
    expect(isPersonalSettingsPath('/settings/help')).toBe(true);
    expect(isPersonalSettingsPath('/settings/members')).toBe(false);
    expect(isPersonalSettingsPath('/settings/general')).toBe(false);
    expect(isPersonalSettingsPath('/genfeed/~/settings')).toBe(false);
  });

  it('builds brand platform home paths and platform query filters', () => {
    expect(APP_ROUTES.PLATFORMS.ROOT).toBe('/platforms');
    expect(APP_ROUTE_PREFIXES.PLATFORMS).toBe('/platforms');
    expect(createPlatformHomeRoute('instagram')).toBe('/platforms/instagram');
    expect(createPlatformHomeRoute('google_ads')).toBe('/platforms/google_ads');
    expect(
      withPlatformQuery(APP_ROUTES.PUBLISHING.SCHEDULED, 'instagram'),
    ).toBe('/publishing/scheduled?platform=instagram');
    expect(
      withPlatformQuery(
        `${APP_ROUTES.PUBLISHING.POSTS}?status=draft`,
        'youtube',
      ),
    ).toBe('/publishing/posts?status=draft&platform=youtube');
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

  it('parses org/brand scope from the URL when layout params are missing', () => {
    expect(parseScopedAppPath('/demo')).toEqual({
      brandSlug: '',
      orgSlug: 'demo',
    });
    expect(parseScopedAppPath('/demo/FUDNEWS/library/images')).toEqual({
      brandSlug: 'FUDNEWS',
      orgSlug: 'demo',
    });
    expect(parseScopedAppPath('/demo/~/settings/credits')).toEqual({
      brandSlug: '',
      orgSlug: 'demo',
    });
    expect(parseScopedAppPath('/admin/organization')).toEqual({
      brandSlug: '',
      orgSlug: '',
    });
    expect(parseScopedAppPath('/library/assets')).toEqual({
      brandSlug: '',
      orgSlug: '',
    });
    expect(parseScopedAppPath('/library')).toEqual({
      brandSlug: '',
      orgSlug: '',
    });
    expect(parseScopedAppPath('/tasks')).toEqual({
      brandSlug: '',
      orgSlug: '',
    });
    expect(parseScopedAppPath('/agent/new')).toEqual({
      brandSlug: '',
      orgSlug: '',
    });
    expect(parseScopedAppPath('/api/version')).toEqual({
      brandSlug: '',
      orgSlug: '',
    });
    expect(parseScopedAppPath('/api/werwer/workspace/inbox/unread')).toEqual({
      brandSlug: '',
      orgSlug: '',
    });
  });
});
