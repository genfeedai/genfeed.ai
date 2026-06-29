import { describe, expect, it } from 'vitest';

import { staticSurfaceClassNames, staticSurfaceCss } from './surface';

describe('static surface primitives', () => {
  it('exposes the card class names for HTML-only surfaces', () => {
    expect(staticSurfaceClassNames.card).toBe('gf-card');
    expect(staticSurfaceClassNames.featureCard).toBe('gf-card gf-feature-card');
    expect(staticSurfaceClassNames.infoCard).toBe('gf-card gf-info-card');
    expect(staticSurfaceCss).toContain('.gf-feature-card');
    expect(staticSurfaceCss).toContain('.gf-info-card');
  });

  it('drives every surface from the single sharp-radius knob', () => {
    // Near-sharp borders: one knob, mirroring the canonical --radius-card (2px).
    expect(staticSurfaceCss).toContain('--gf-surface-radius: 2px');
    expect(staticSurfaceCss).toContain(
      'border-radius: var(--gf-surface-radius)',
    );
    // No surface should pin the old fixed card radius any more.
    expect(staticSurfaceCss).not.toContain(
      'border-radius: var(--gf-radius-md)',
    );
  });

  it('keeps card/surface fills free of tonal gradients', () => {
    // The feature card must use a flat fill, not the old diagonal sheen.
    expect(staticSurfaceCss).not.toContain('linear-gradient(160deg');
    expect(staticSurfaceCss).toContain('.gf-feature-card {');
  });
});
