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

    it('uses two meaningful groups: Account and Support', () => {
      expect(items.map((item) => item.group)).toEqual(['Account', 'Support']);
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
    it('shows the organization pages plus the Brands and Models hubs (no Help)', () => {
      expect(
        buildSettingsMenuItems({ scope: 'organization' }).map((i) => i.label),
      ).toEqual([
        'General',
        'Members',
        'Brands',
        'Models',
        'Credits',
        'API Keys',
        'Webhooks',
        'Policy',
      ]);
    });

    it('adds Billing when organization billing is available (SaaS or EE)', () => {
      expect(
        buildSettingsMenuItems({
          scope: 'organization',
          isEnterprise: true,
        }).map((i) => i.label),
      ).toEqual([
        'General',
        'Members',
        'Brands',
        'Models',
        'Billing',
        'Credits',
        'API Keys',
        'Webhooks',
        'Policy',
      ]);
    });

    it('uses two meaningful groups: Organization and Access', () => {
      expect(
        buildSettingsMenuItems({ scope: 'organization' }).map((item) => [
          item.label,
          item.group,
        ]),
      ).toEqual([
        ['General', 'Organization'],
        ['Members', 'Organization'],
        ['Brands', 'Organization'],
        ['Models', 'Organization'],
        ['Credits', 'Access'],
        ['API Keys', 'Access'],
        ['Webhooks', 'Access'],
        ['Policy', 'Access'],
      ]);
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

    it('points Brands and Models at their hubs (prefix-active, not exact)', () => {
      const items = buildSettingsMenuItems({ scope: 'organization' });
      expect(items.find((i) => i.label === 'Credits')?.href).toBe(
        '/settings/credits',
      );
      expect(items.find((i) => i.label === 'Brands')?.href).toBe(
        '/settings/brands',
      );
      const models = items.find((i) => i.label === 'Models');
      expect(models?.href).toBe('/settings/models');
      expect(models?.isExactMatch).toBeUndefined();
    });
  });

  describe('brand scope', () => {
    const items = buildSettingsMenuItems({ scope: 'brand' });

    it('shows brand profile + automation pages including Social and Brand Kit', () => {
      expect(items.map((item) => item.label)).toEqual([
        'Profile',
        'Social',
        'Brand Kit',
        'Voice',
        'Interview',
        'Harness',
        'Publishing',
        'Agent Defaults',
      ]);
    });

    it('scopes every entry to the brand and marks Profile exact', () => {
      expect(items.every((item) => item.hrefScope === 'brand')).toBe(true);
      expect(items.find((i) => i.label === 'Profile')?.isExactMatch).toBe(true);
      expect(items.find((i) => i.label === 'Profile')?.href).toBe('/settings');
      expect(items.find((i) => i.label === 'Social')?.href).toBe(
        '/settings/social',
      );
      expect(items.find((i) => i.label === 'Brand Kit')?.href).toBe(
        '/settings/kit',
      );
      expect(items.find((i) => i.label === 'Voice')?.href).toBe(
        '/settings/voice',
      );
    });

    it('uses two meaningful groups: Brand and Automation', () => {
      expect(items.map((item) => [item.label, item.group])).toEqual([
        ['Profile', 'Brand'],
        ['Social', 'Brand'],
        ['Brand Kit', 'Brand'],
        ['Voice', 'Brand'],
        ['Interview', 'Brand'],
        ['Harness', 'Automation'],
        ['Publishing', 'Automation'],
        ['Agent Defaults', 'Automation'],
      ]);
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
