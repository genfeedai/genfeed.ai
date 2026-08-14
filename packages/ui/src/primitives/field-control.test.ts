import { describe, expect, it } from 'vitest';
import {
  fieldControlPopoverClassName,
  overlayMenuSurfaceClassName,
} from './field-control';

describe('overlayMenuSurfaceClassName', () => {
  it('uses the tertiary overlay surface, not the canvas or card', () => {
    expect(overlayMenuSurfaceClassName).toContain('bg-tertiary');
    expect(overlayMenuSurfaceClassName).toContain('shadow-dropdown');
    expect(overlayMenuSurfaceClassName).not.toContain('bg-card');
    expect(overlayMenuSurfaceClassName).not.toContain('bg-elevated');
    expect(overlayMenuSurfaceClassName).not.toContain('bg-primary');
  });

  it('is the surface used by field-control popovers', () => {
    expect(fieldControlPopoverClassName).toContain(overlayMenuSurfaceClassName);
  });
});
