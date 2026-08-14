import { describe, expect, it } from 'vitest';
import {
  fieldControlPopoverClassName,
  overlayMenuSurfaceClassName,
} from './field-control';

describe('overlayMenuSurfaceClassName', () => {
  it('uses the secondary overlay surface, not elevated or canvas', () => {
    expect(overlayMenuSurfaceClassName).toContain('bg-secondary');
    expect(overlayMenuSurfaceClassName).toContain('shadow-dropdown');
    expect(overlayMenuSurfaceClassName).not.toContain('bg-card');
    expect(overlayMenuSurfaceClassName).not.toContain('bg-elevated');
    expect(overlayMenuSurfaceClassName).not.toContain('bg-tertiary');
    expect(overlayMenuSurfaceClassName).not.toContain('bg-primary');
  });

  it('is the surface used by field-control popovers', () => {
    expect(fieldControlPopoverClassName).toContain(overlayMenuSurfaceClassName);
  });
});
