import { SettingsSurface } from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';

import { resolveSettingsScope } from './app-protected-layout.settings-scope';

describe('resolveSettingsScope', () => {
  it('resolves brand scope when a brand slug is present', () => {
    expect(
      resolveSettingsScope({ brandSlug: 'brand-123', orgSlug: 'org-123' }),
    ).toBe(SettingsSurface.BRAND);
  });

  it('resolves organization scope when only an org slug is present', () => {
    expect(resolveSettingsScope({ orgSlug: 'org-123' })).toBe(
      SettingsSurface.ORGANIZATION,
    );
  });

  it('resolves personal scope when neither slug is present', () => {
    expect(resolveSettingsScope({})).toBe(SettingsSurface.PERSONAL);
  });
});
