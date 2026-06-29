import { describe, expect, it } from 'vitest';

import { staticSurfaceClassNames, staticSurfaceCss } from './surface';

describe('static surface primitives', () => {
  it('uses the shared card radius for HTML-only surfaces', () => {
    expect(staticSurfaceClassNames.card).toBe('gf-card');
    expect(staticSurfaceCss).toContain('border-radius: var(--gf-radius-md)');
    expect(staticSurfaceCss).toContain('--gf-radius-md: 6px');
  });
});
