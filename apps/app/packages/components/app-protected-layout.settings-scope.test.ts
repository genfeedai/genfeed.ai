import { SettingsSurface } from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';

import {
  isPersonalSettingsPage,
  resolveSettingsScope,
} from './app-protected-layout.settings-scope';

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

describe('isPersonalSettingsPage', () => {
  it('is true for every flat personal settings page', () => {
    expect(isPersonalSettingsPage('/settings')).toBe(true);
    expect(isPersonalSettingsPage('/settings/personal')).toBe(true);
    expect(isPersonalSettingsPage('/settings/notifications')).toBe(true);
    expect(isPersonalSettingsPage('/settings/progress')).toBe(true);
    expect(isPersonalSettingsPage('/settings/help')).toBe(true);
    expect(isPersonalSettingsPage('/settings/about')).toBe(true);
  });

  it('is true for the org-scoped copy of every personal page (#4659 review)', () => {
    expect(isPersonalSettingsPage('/acme/~/settings/personal')).toBe(true);
    expect(isPersonalSettingsPage('/acme/~/settings/notifications')).toBe(true);
    expect(isPersonalSettingsPage('/acme/~/settings/progress')).toBe(true);
    expect(isPersonalSettingsPage('/acme/~/settings/help')).toBe(true);
  });

  it('is false for actual organization settings pages', () => {
    expect(isPersonalSettingsPage('/acme/~/settings/general')).toBe(false);
    expect(isPersonalSettingsPage('/acme/~/settings/members')).toBe(false);
    expect(isPersonalSettingsPage('/acme/~/settings/brands')).toBe(false);
  });

  it('is false for brand-scoped settings pages', () => {
    expect(isPersonalSettingsPage('/acme/brand/settings')).toBe(false);
    expect(isPersonalSettingsPage('/acme/brand/settings/publishing')).toBe(
      false,
    );
  });

  it('is false for non-settings routes', () => {
    expect(isPersonalSettingsPage('/')).toBe(false);
    expect(isPersonalSettingsPage('/connect')).toBe(false);
    expect(isPersonalSettingsPage('/acme/~/workspace')).toBe(false);
  });

  it('handles a null or missing pathname', () => {
    expect(isPersonalSettingsPage(null)).toBe(false);
    expect(isPersonalSettingsPage(undefined)).toBe(false);
  });
});
