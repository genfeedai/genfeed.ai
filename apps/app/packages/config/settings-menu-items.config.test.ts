import { describe, expect, it } from 'vitest';
import {
  buildSettingsMenuItems,
  SETTINGS_LOGO_HREF,
} from './settings-menu-items.config';

describe('buildSettingsMenuItems', () => {
  describe('personal scope', () => {
    const items = buildSettingsMenuItems({ scope: 'personal' });

    it('shows only the personal pages plus Help', () => {
      expect(items.map((item) => item.label)).toEqual(['Personal', 'Help']);
    });

    it('scopes both entries to the personal context', () => {
      expect(items.every((item) => item.hrefScope === 'personal')).toBe(true);
      expect(items.find((i) => i.label === 'Help')?.href).toBe(
        '/settings/help',
      );
    });

    it('marks the Personal root as exact-match so it does not highlight Help', () => {
      expect(items.find((i) => i.label === 'Personal')?.isExactMatch).toBe(
        true,
      );
      expect(
        items.find((i) => i.label === 'Help')?.isExactMatch,
      ).toBeUndefined();
    });
  });

  describe('organization scope', () => {
    it('shows only the organization pages (no Brands, no Help)', () => {
      expect(
        buildSettingsMenuItems({ scope: 'organization' }).map((i) => i.label),
      ).toEqual(['General', 'Members', 'API Keys', 'Policy']);
    });

    it('adds Billing only on the enterprise edition', () => {
      expect(
        buildSettingsMenuItems({
          scope: 'organization',
          isEnterprise: true,
        }).map((i) => i.label),
      ).toEqual(['General', 'Members', 'Billing', 'API Keys', 'Policy']);
    });

    it('scopes every entry to the organization and marks General exact', () => {
      const items = buildSettingsMenuItems({
        scope: 'organization',
        isEnterprise: true,
      });
      expect(items.every((item) => item.hrefScope === 'organization')).toBe(
        true,
      );
      expect(items.find((i) => i.label === 'General')?.isExactMatch).toBe(true);
      expect(items.find((i) => i.label === 'General')?.href).toBe('/settings');
    });
  });

  describe('brand scope', () => {
    const items = buildSettingsMenuItems({ scope: 'brand' });

    it('shows only the brand pages', () => {
      expect(items.map((item) => item.label)).toEqual([
        'Overview',
        'Voice',
        'Harness',
        'Interview',
        'Publishing',
        'Agent Defaults',
      ]);
    });

    it('scopes every entry to the brand and marks Overview exact', () => {
      expect(items.every((item) => item.hrefScope === 'brand')).toBe(true);
      expect(items.find((i) => i.label === 'Overview')?.isExactMatch).toBe(
        true,
      );
      expect(items.find((i) => i.label === 'Overview')?.href).toBe('/settings');
      expect(items.find((i) => i.label === 'Voice')?.href).toBe(
        '/settings/voice',
      );
    });
  });

  it('never mixes scopes: each scope carries a single hrefScope', () => {
    for (const scope of ['personal', 'organization', 'brand'] as const) {
      const scopes = new Set(
        buildSettingsMenuItems({ scope }).map((item) => item.hrefScope),
      );
      expect(scopes.size).toBe(1);
    }
  });

  it('gives every item a label, href, and both icon variants', () => {
    for (const scope of ['personal', 'organization', 'brand'] as const) {
      for (const item of buildSettingsMenuItems({
        scope,
        isEnterprise: true,
      })) {
        expect(item.label).toBeTruthy();
        expect(item.href).toBeTruthy();
        expect(item.outline).toBeDefined();
        expect(item.solid).toBeDefined();
      }
    }
  });

  it('has a logo href set', () => {
    expect(SETTINGS_LOGO_HREF).toBeTruthy();
  });
});
