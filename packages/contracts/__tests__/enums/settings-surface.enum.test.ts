import { describe, expect, it } from 'vitest';
import {
  SETTINGS_SURFACE_LABELS,
  SettingsSurface,
} from '../../src/enums/settings-surface.enum';

describe('settings-surface.enum', () => {
  it('uses lowercase product language, not Prisma SCREAMING labels', () => {
    expect(SettingsSurface.PERSONAL).toBe('personal');
    expect(SettingsSurface.ORGANIZATION).toBe('organization');
    expect(SettingsSurface.BRAND).toBe('brand');
  });

  it('labels every surface', () => {
    expect(SETTINGS_SURFACE_LABELS[SettingsSurface.PERSONAL]).toBe('Personal');
    expect(SETTINGS_SURFACE_LABELS[SettingsSurface.ORGANIZATION]).toBe(
      'Organization',
    );
    expect(SETTINGS_SURFACE_LABELS[SettingsSurface.BRAND]).toBe('Brand');
  });
});
