import { settingsOptions } from '@helpers/business/settings/settings.helper';
import { describe, expect, it } from 'vitest';

describe('settingsOptions', () => {
  it('contains the Advanced Mode option', () => {
    const advancedMode = settingsOptions.find(
      (o) => o.key === 'isAdvancedMode',
    );
    expect(advancedMode).toBeDefined();
    expect(advancedMode?.label).toBe('Advanced Mode');
  });

  it('every option has required fields: key, label, description, isDisabled', () => {
    for (const option of settingsOptions) {
      expect(typeof option.key).toBe('string');
      expect(typeof option.label).toBe('string');
      expect(typeof option.description).toBe('string');
      expect(typeof option.isDisabled).toBe('boolean');
    }
  });
});
