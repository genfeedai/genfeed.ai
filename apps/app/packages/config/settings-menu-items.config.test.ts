import { describe, expect, it } from 'vitest';
import {
  SETTINGS_LOGO_HREF,
  SETTINGS_MENU_ITEMS,
} from './settings-menu-items.config';

describe('SETTINGS_MENU_ITEMS', () => {
  it('renders a single coherent Settings section with no sub-group headers (#1231)', () => {
    // Every item is ungrouped so the sidebar shows one "Settings" section
    // instead of redundant single-item Account/Workspace/Support groups.
    for (const item of SETTINGS_MENU_ITEMS) {
      expect(item.group).toBeUndefined();
    }
  });

  it('lists the settings destinations in order', () => {
    expect(SETTINGS_MENU_ITEMS.map((item) => item.label)).toEqual([
      'Personal',
      'Organization',
      'Brands',
      'Help',
    ]);
  });

  it('scopes each destination correctly', () => {
    expect(
      SETTINGS_MENU_ITEMS.map((item) => ({
        hrefScope: item.hrefScope,
        href: item.href,
        label: item.label,
      })),
    ).toEqual([
      { hrefScope: 'personal', href: '/settings', label: 'Personal' },
      { hrefScope: 'organization', href: '/settings', label: 'Organization' },
      {
        hrefScope: 'organization',
        href: '/settings/brands',
        label: 'Brands',
      },
      { hrefScope: 'organization', href: '/settings/help', label: 'Help' },
    ]);
  });

  it('all items have required fields: label, href, outline, solid', () => {
    for (const item of SETTINGS_MENU_ITEMS) {
      expect(item.label).toBeTruthy();
      expect(item.href).toBeTruthy();
      expect(item.outline).toBeDefined();
      expect(item.solid).toBeDefined();
    }
  });

  it('has a logo href set', () => {
    expect(SETTINGS_LOGO_HREF).toBeTruthy();
  });
});
