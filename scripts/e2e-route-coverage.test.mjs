import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildRouteReferenceInventory,
  canonicalize,
  extractRouteReferenceKeys,
  readAppRouteConstants,
  readAppRouteSuffix,
} from './e2e-route-coverage.mjs';

describe('e2e-route-coverage APP_ROUTES extraction', () => {
  it('reads multiline route values such as ELEMENTS_CAMERA_MOVEMENTS', () => {
    const source = `
export const APP_ROUTES = {
  ADMIN: {
    CONFIGURATION: {
      ELEMENTS_CAMERA_MOVEMENTS:
        '/admin/configuration/elements/camera-movements',
      ELEMENTS_CAMERAS: '/admin/configuration/elements/cameras',
    },
  },
};
`;
    const routes = readAppRouteConstants(source);
    assert.equal(
      routes.get('APP_ROUTES.ADMIN.CONFIGURATION.ELEMENTS_CAMERA_MOVEMENTS'),
      '/admin/configuration/elements/camera-movements',
    );
    assert.equal(
      routes.get('APP_ROUTES.ADMIN.CONFIGURATION.ELEMENTS_CAMERAS'),
      '/admin/configuration/elements/cameras',
    );
  });

  it('keeps path suffixes composed after APP_ROUTES references', () => {
    const srcConcat = "APP_ROUTES.STUDIO.STORYBOARD + '/mock-id'";
    const matchConcat = srcConcat.match(/\bAPP_ROUTES(?:\.[A-Z][A-Z0-9_]*)+/);
    assert.ok(matchConcat);
    assert.equal(
      readAppRouteSuffix(srcConcat, matchConcat.index, matchConcat[0].length),
      '/mock-id',
    );
    assert.equal(
      canonicalize(
        `/admin/images${readAppRouteSuffix(
          srcConcat,
          matchConcat.index,
          matchConcat[0].length,
        )}`,
      ),
      '/admin/images/*',
    );

    // biome-ignore lint/suspicious/noTemplateCurlyInString: fixture source is a template literal.
    const srcTemplate = '`${APP_ROUTES.STUDIO.STORYBOARD}/mock-id`';
    // Match only the APP_ROUTES token, not the surrounding template bits.
    const token = 'APP_ROUTES.STUDIO.STORYBOARD';
    const idx = srcTemplate.indexOf(token);
    assert.equal(
      readAppRouteSuffix(srcTemplate, idx, token.length),
      '/mock-id',
    );
    assert.equal(
      canonicalize(
        `/studio/storyboard${readAppRouteSuffix(srcTemplate, idx, token.length)}`,
      ),
      '/studio/storyboard/*',
    );
  });
});

describe('static route reference inventory', () => {
  it('never credits parents, descendants, or dynamic siblings', () => {
    const report = buildRouteReferenceInventory(
      ['/posts', '/posts/*', '/posts/*/edit', '/settings/profile'],
      new Set(['/posts/*', '/settings']),
    );
    assert.deepEqual(report.referencedRoutes, ['/posts/*']);
    assert.equal(report.referencePercent, 25);
    assert.equal(report.executedRouteCount, null);
    assert.equal(report.kind, 'static-reference-inventory');
    assert.equal(Object.hasOwn(report, 'effectivePercent'), false);
  });
});

it('credits concrete dynamic route templates without parent-prefix credit', () => {
  const keys = extractRouteReferenceKeys(
    // biome-ignore lint/suspicious/noTemplateCurlyInString: fixture contains source templates to parse.
    'page.goto(`/posts/${id}`); page.goto(`${UNKNOWN_PREFIX}/settings`);',
  );
  assert.ok(keys.has('/posts/*'));
  assert.ok(!keys.has('/posts'));
  assert.ok(!keys.has('/settings'));
});

it('rejects an empty route discovery result', () => {
  assert.throws(
    () => buildRouteReferenceInventory([], new Set()),
    /No app routes discovered/,
  );
});
