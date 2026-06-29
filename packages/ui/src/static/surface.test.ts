import { describe, expect, it } from 'vitest';

import { staticSurfaceClassNames, staticSurfaceCss } from './surface';

describe('static surface primitives', () => {
  it('uses the shared card radius for HTML-only surfaces', () => {
    expect(staticSurfaceClassNames.card).toBe('gf-card');
    expect(staticSurfaceClassNames.featureCard).toBe('gf-card gf-feature-card');
    expect(staticSurfaceClassNames.infoCard).toBe('gf-card gf-info-card');
    expect(staticSurfaceCss).toContain('border-radius: var(--gf-radius-md)');
    expect(staticSurfaceCss).toContain('--gf-radius-md: 6px');
    expect(staticSurfaceCss).toContain('.gf-feature-card');
    expect(staticSurfaceCss).toContain('.gf-info-card');
  });
});
