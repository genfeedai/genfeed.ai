import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  canonicalize,
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
    const srcConcat = "APP_ROUTES.STUDIO.IMAGE + '/mock-id'";
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
    const srcTemplate = '`${APP_ROUTES.STUDIO.IMAGE}/mock-id`';
    // Match only the APP_ROUTES token, not the surrounding template bits.
    const token = 'APP_ROUTES.STUDIO.IMAGE';
    const idx = srcTemplate.indexOf(token);
    assert.equal(
      readAppRouteSuffix(srcTemplate, idx, token.length),
      '/mock-id',
    );
    assert.equal(
      canonicalize(
        `/studio/image${readAppRouteSuffix(srcTemplate, idx, token.length)}`,
      ),
      '/studio/image/*',
    );
  });
});
