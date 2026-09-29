import { SettingsSurface } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { describe, expect, it } from 'vitest';
import { buildSettingsMenuItems } from './settings-menu-items.config';

describe('buildSettingsMenuItems', () => {
  describe('personal scope', () => {
    const items = buildSettingsMenuItems({ scope: SettingsSurface.PERSONAL });

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
  });

  describe('organization scope', () => {
    it('hides Credits when the wallet is unavailable but preserves usage history', () => {
      const items = buildSettingsMenuItems({
        scope: SettingsSurface.ORGANIZATION,
        showCredits: false,
      });
      expect(items.find((i) => i.label === 'Credits')).toBeUndefined();
      expect(items.find((i) => i.label === 'Usage')?.href).toBe(
        APP_ROUTES.SETTINGS.USAGE,
      );
      expect(items.find((i) => i.label === 'Subscription')).toBeUndefined();
      expect(items.find((i) => i.label === 'API Keys')?.href).toBe(
        '/settings/api-keys',
      );
    });

    it('keeps Credits and Usage separate and points Brands and Models at their hubs', () => {
      const items = buildSettingsMenuItems({
        scope: SettingsSurface.ORGANIZATION,
      });
      expect(items.find((i) => i.label === 'Credits')?.href).toBe(
        '/settings/credits',
      );
      expect(items.find((i) => i.label === 'Usage')?.href).toBe(
        '/settings/usage',
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
    const items = buildSettingsMenuItems({ scope: SettingsSurface.BRAND });

    it('scopes every entry to the brand and marks Profile exact', () => {
      expect(items.every((item) => item.hrefScope === 'brand')).toBe(true);
      expect(items.find((i) => i.label === 'Profile')?.isExactMatch).toBe(true);
      expect(items.find((i) => i.label === 'Profile')?.href).toBe(
        APP_ROUTES.SETTINGS.ROOT,
      );
      expect(items.find((i) => i.label === 'Integrations')?.href).toBe(
        '/settings/integrations',
      );
      expect(items.find((i) => i.label === 'Links')).toBeUndefined();
      expect(items.find((i) => i.label === 'Brand Kit')?.href).toBe(
        '/settings/kit',
      );
      expect(items.find((i) => i.label === 'Knowledge')?.href).toBe(
        APP_ROUTES.SETTINGS.KNOWLEDGE,
      );
      expect(items.find((i) => i.label === 'Characters')?.href).toBe(
        APP_ROUTES.SETTINGS.CHARACTERS,
      );
      expect(items.find((i) => i.label === 'Brand voice')?.href).toBe(
        '/settings/voice',
      );
      expect(items.find((i) => i.label === 'Agent context')?.href).toBe(
        '/settings/agent-context',
      );
      expect(items.find((i) => i.label === 'Skills')?.href).toBe(
        APP_ROUTES.SETTINGS.SKILLS,
      );
      expect(items.find((i) => i.label === 'Usage')?.href).toBe(
        APP_ROUTES.SETTINGS.USAGE,
      );
    });
  });
});
