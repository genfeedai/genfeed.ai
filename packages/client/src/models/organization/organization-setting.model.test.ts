import { describe, expect, it } from 'vitest';
import { OrganizationSetting } from './organization-setting.model';

describe('OrganizationSetting module preferences', () => {
  it('preserves typed module overrides from the JSON API response', () => {
    const settings = new OrganizationSetting({
      moduleOverrides: { automation: false, discovery: true, batch: true },
    });
    expect(settings.moduleOverrides).toEqual({
      automation: false,
      discovery: true,
      batch: true,
    });
  });
});
