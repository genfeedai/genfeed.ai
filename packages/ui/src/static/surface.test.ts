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
    // Sharp borders: one knob, mirroring the canonical --radius-card (0px).
    expect(staticSurfaceCss).toContain('--gf-surface-radius: 0px');
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

  it('supports system, light, and dark color schemes from shared tokens', () => {
    expect(staticSurfaceCss).toContain('color-scheme: light dark');
    expect(staticSurfaceCss).toContain('@media (prefers-color-scheme: dark)');
    expect(staticSurfaceCss).toContain('.gf-ui[data-theme="light"]');
    expect(staticSurfaceCss).toContain('.gf-ui[data-theme="dark"]');
    expect(staticSurfaceCss).toContain('--gf-bg-primary: #FAFAFA');
    expect(staticSurfaceCss).toContain('--gf-bg-primary: #0A0A0A');
    expect(staticSurfaceCss).toContain('--gf-grid-line:');
    expect(staticSurfaceCss).toContain('--gf-divider-subtle:');
  });

  it('keeps every neutral hue-free in both themes', () => {
    // The light theme was a warm parchment (#FAFAF9 / rgba(13, 13, 13, …)).
    // True neutrals only: an off-axis canvas tints every asset rendered on it.
    const warmNeutrals = staticSurfaceCss.match(
      /#(?:[0-9A-F]{2})(?:[0-9A-F]{2})(?:[0-9A-F]{2})\b/gi,
    );
    const productNeutrals = (warmNeutrals ?? []).filter((hex) => {
      const [r, g, b] = [1, 3, 5].map((i) =>
        Number.parseInt(hex.slice(i, i + 2), 16),
      );
      const spread = Math.max(r, g, b) - Math.min(r, g, b);
      // Platform brand hexes are meant to be saturated; neutrals are not.
      return spread > 0 && spread < 40;
    });
    expect(productNeutrals).toEqual([]);
  });
});
