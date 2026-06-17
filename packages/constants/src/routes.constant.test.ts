import { describe, expect, it } from 'vitest';
import {
  APP_ROUTE_PREFIXES,
  APP_ROUTE_TEMPLATES,
  APP_ROUTES,
  COMPOSE_ROUTES,
  createBrandAppRoute,
  createOrganizationAppRoute,
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

  it('documents canonical settings route templates', () => {
    expect(APP_ROUTE_TEMPLATES.PERSONAL_SETTINGS).toBe('/settings');
    expect(APP_ROUTE_TEMPLATES.ORGANIZATION_SETTINGS).toBe(
      '/:orgSlug/~/settings',
    );
    expect(APP_ROUTE_TEMPLATES.BRAND_SETTINGS).toBe(
      '/:orgSlug/:brandSlug/settings',
    );
  });

  it('builds scoped brand and organization routes', () => {
    expect(
      createBrandAppRoute(
        'genfeed-ai',
        'paperclip',
        APP_ROUTES.WORKSPACE.OVERVIEW,
      ),
    ).toBe('/genfeed-ai/paperclip/workspace/overview');
    expect(createBrandAppRoute('genfeed-ai', 'paperclip', 'studio/image')).toBe(
      '/genfeed-ai/paperclip/studio/image',
    );
    expect(createBrandAppRoute('genfeed-ai', 'paperclip')).toBe(
      '/genfeed-ai/paperclip',
    );
    expect(
      createOrganizationAppRoute('genfeed-ai', APP_ROUTES.SETTINGS.ROOT),
    ).toBe('/genfeed-ai/~/settings');
    expect(createOrganizationAppRoute('genfeed-ai', 'billing')).toBe(
      '/genfeed-ai/~/billing',
    );
    expect(createOrganizationAppRoute('genfeed-ai')).toBe('/genfeed-ai/~');
  });
});
