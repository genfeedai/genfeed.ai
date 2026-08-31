import { APP_ROUTES } from '@genfeedai/constants';
import { SettingsSurface } from '@genfeedai/enums';
import { describe, expect, it } from 'vitest';
import { buildSettingsMenuItems } from './settings-menu-items.config';

describe('buildSettingsMenuItems', () => {
  describe('personal scope', () => {
    const items = buildSettingsMenuItems({ scope: SettingsSurface.PERSONAL });

    it('shows the split personal pages plus Help', () => {
      expect(items.map((item) => item.label)).toEqual([
        'Personal',
        'Notifications',
        'Progress',
        'Help',
      ]);
    });

    it('scopes every entry to the personal context', () => {
      expect(items.every((item) => item.hrefScope === 'personal')).toBe(true);
      expect(items.find((i) => i.label === 'Notifications')?.href).toBe(
        APP_ROUTES.SETTINGS.NOTIFICATIONS,
      );
      expect(items.find((i) => i.label === 'Progress')?.href).toBe(
        APP_ROUTES.SETTINGS.PROGRESS,
      );
      expect(items.find((i) => i.label === 'Help')?.href).toBe(
        APP_ROUTES.SETTINGS.HELP,
      );
    });

    it('keeps every personal page under Account', () => {
      expect(items.every((item) => item.group === 'Account')).toBe(true);
    });

    it('marks the Personal root as exact-match so it does not highlight Help', () => {
      expect(items.find((i) => i.label === 'Personal')?.isExactMatch).toBe(
        true,
      );
      expect(items.find((i) => i.label === 'Personal')?.href).toBe(
        APP_ROUTES.SETTINGS.PERSONAL,
      );
      expect(
        items.find((i) => i.label === 'Help')?.isExactMatch,
      ).toBeUndefined();
    });
  });

  describe('organization scope', () => {
    it('shows the organization pages plus the Brands and Models hubs (no Help)', () => {
      expect(
        buildSettingsMenuItems({ scope: SettingsSurface.ORGANIZATION }).map(
          (i) => i.label,
        ),
      ).toEqual([
        'General',
        'Members',
        'Brands',
        'Models',
        'Agents',
        'Credits',
        'Cost & Usage',
        'API Keys',
        'Integrations',
        'Webhooks',
      ]);
    });

    it('adds Subscription under Billing when organization billing is available (SaaS or EE)', () => {
      expect(
        buildSettingsMenuItems({
          scope: SettingsSurface.ORGANIZATION,
          isEnterprise: true,
        }).map((i) => i.label),
      ).toEqual([
        'General',
        'Members',
        'Brands',
        'Models',
        'Agents',
        'Credits',
        'Subscription',
        'Cost & Usage',
        'API Keys',
        'Integrations',
        'Webhooks',
      ]);
    });

    it('uses Organization, Billing, and Developer groups', () => {
      expect(
        buildSettingsMenuItems({ scope: SettingsSurface.ORGANIZATION }).map(
          (item) => [item.label, item.group],
        ),
      ).toEqual([
        ['General', 'Organization'],
        ['Members', 'Organization'],
        ['Brands', 'Organization'],
        ['Models', 'Organization'],
        ['Agents', 'Organization'],
        ['Credits', 'Billing'],
        ['Cost & Usage', 'Billing'],
        ['API Keys', 'Developer'],
        ['Integrations', 'Developer'],
        ['Webhooks', 'Developer'],
      ]);
    });

    it('scopes every entry to the organization and marks General exact', () => {
      const items = buildSettingsMenuItems({
        scope: SettingsSurface.ORGANIZATION,
        isEnterprise: true,
      });
      expect(items.every((item) => item.hrefScope === 'organization')).toBe(
        true,
      );
      expect(items.find((i) => i.label === 'General')?.isExactMatch).toBe(true);
      expect(items.find((i) => i.label === 'General')?.href).toBe(
        APP_ROUTES.SETTINGS.GENERAL,
      );
    });

    it('hides Credits when the wallet is unavailable but keeps provider cost reporting', () => {
      const items = buildSettingsMenuItems({
        scope: SettingsSurface.ORGANIZATION,
        showCredits: false,
      });
      expect(items.find((i) => i.label === 'Credits')).toBeUndefined();
      expect(items.find((i) => i.label === 'Cost & Usage')?.href).toBe(
        APP_ROUTES.SETTINGS.USAGE,
      );
      expect(items.find((i) => i.label === 'Subscription')).toBeUndefined();
      expect(items.find((i) => i.label === 'API Keys')?.href).toBe(
        '/settings/api-keys',
      );
    });

    it('points Credits, Brands and Models at their hubs (prefix-active, not exact)', () => {
      const items = buildSettingsMenuItems({
        scope: SettingsSurface.ORGANIZATION,
      });
      expect(items.find((i) => i.label === 'Credits')?.href).toBe(
        '/settings/credits',
      );
      expect(items.find((i) => i.label === 'Cost & Usage')?.href).toBe(
        '/settings/usage',
      );
      expect(items.find((i) => i.label === 'Brands')?.href).toBe(
        '/settings/brands',
      );
      const models = items.find((i) => i.label === 'Models');
      expect(models?.href).toBe('/settings/models');
      expect(models?.isExactMatch).toBeUndefined();
    });

    it('points Agents at /settings/agents so the slug matches the label', () => {
      const items = buildSettingsMenuItems({
        scope: SettingsSurface.ORGANIZATION,
      });
      expect(items.find((i) => i.label === 'Agents')?.href).toBe(
        APP_ROUTES.SETTINGS.AGENTS,
      );
      expect(APP_ROUTES.SETTINGS.AGENTS).toBe('/settings/agents');
    });
  });

  describe('brand scope', () => {
    const items = buildSettingsMenuItems({ scope: SettingsSurface.BRAND });

    it('shows brand profile + automation pages including Social and Brand Kit', () => {
      expect(items.map((item) => item.label)).toEqual([
        'Profile',
        'Social',
        'Brand Kit',
        'Characters',
        'Brand voice',
        'Interview',
        'Harness',
        'Publishing',
        'Agent Defaults',
        'Skills',
        'Cost & Usage',
      ]);
    });

    it('scopes every entry to the brand and marks Profile exact', () => {
      expect(items.every((item) => item.hrefScope === 'brand')).toBe(true);
      expect(items.find((i) => i.label === 'Profile')?.isExactMatch).toBe(true);
      expect(items.find((i) => i.label === 'Profile')?.href).toBe(
        APP_ROUTES.SETTINGS.ROOT,
      );
      expect(items.find((i) => i.label === 'Social')?.href).toBe(
        '/settings/social',
      );
      expect(items.find((i) => i.label === 'Links')).toBeUndefined();
      expect(items.find((i) => i.label === 'Brand Kit')?.href).toBe(
        '/settings/kit',
      );
      expect(items.find((i) => i.label === 'Characters')?.href).toBe(
        APP_ROUTES.SETTINGS.CHARACTERS,
      );
      expect(items.find((i) => i.label === 'Brand voice')?.href).toBe(
        '/settings/voice',
      );
      expect(items.find((i) => i.label === 'Skills')?.href).toBe(
        APP_ROUTES.SETTINGS.SKILLS,
      );
      expect(items.find((i) => i.label === 'Cost & Usage')?.href).toBe(
        APP_ROUTES.SETTINGS.USAGE,
      );
    });

    it('uses meaningful Brand, Automation, and Billing groups', () => {
      expect(items.map((item) => [item.label, item.group])).toEqual([
        ['Profile', 'Brand'],
        ['Social', 'Brand'],
        ['Brand Kit', 'Brand'],
        ['Characters', 'Brand'],
        ['Brand voice', 'Brand'],
        ['Interview', 'Brand'],
        ['Harness', 'Automation'],
        ['Publishing', 'Automation'],
        ['Agent Defaults', 'Automation'],
        ['Skills', 'Automation'],
        ['Cost & Usage', 'Billing'],
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
});
