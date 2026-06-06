import { describe, expect, it } from 'vitest';

import {
  getSettingsFieldsByScope,
  SETTINGS_SCOPE_CONFLICTS,
  SETTINGS_SCOPE_FIELD_OWNERSHIP,
  SETTINGS_SCOPES,
} from './settings-scope.constant';

describe('settings scope ownership', () => {
  it('documents at least one canonical owner for each scope', () => {
    for (const scope of SETTINGS_SCOPES) {
      expect(getSettingsFieldsByScope(scope).length).toBeGreaterThan(0);
    }
  });

  it('keeps fields uniquely owned in the canonical map', () => {
    const fields = SETTINGS_SCOPE_FIELD_OWNERSHIP.map(({ field }) => field);

    expect(new Set(fields).size).toBe(fields.length);
  });

  it('keeps conflict notes tied to known canonical fields', () => {
    for (const conflict of SETTINGS_SCOPE_CONFLICTS) {
      const canonicalField = SETTINGS_SCOPE_FIELD_OWNERSHIP.find(
        ({ field, owner }) =>
          field === conflict.field && owner === conflict.canonicalOwner,
      );

      expect(canonicalField).toBeDefined();
      expect(conflict.competingScopes).not.toContain(conflict.canonicalOwner);
      expect(conflict.resolution.length).toBeGreaterThan(0);
    }
  });

  it('assigns settings consolidation fields to the intended scopes', () => {
    expect(
      SETTINGS_SCOPE_FIELD_OWNERSHIP.find(
        ({ field }) => field === 'agentConfig.voice',
      )?.owner,
    ).toBe('brand');
    expect(
      SETTINGS_SCOPE_FIELD_OWNERSHIP.find(
        ({ field }) => field === 'agentPolicy',
      )?.owner,
    ).toBe('organization');
    expect(
      SETTINGS_SCOPE_FIELD_OWNERSHIP.find(({ field }) => field === 'model')
        ?.owner,
    ).toBe('agent');
  });
});
