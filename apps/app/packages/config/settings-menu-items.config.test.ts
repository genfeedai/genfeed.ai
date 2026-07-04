import { describe, expect, it } from 'vitest';
import {
  buildSettingsMenuItems,
  SETTINGS_LOGO_HREF,
} from './settings-menu-items.config';

describe('buildSettingsMenuItems', () => {
  describe('off a brand route (org/personal scope)', () => {
    it('lists a single flat Settings section: Personal, Organization group, flat Brands, Help', () => {
      expect(buildSettingsMenuItems().map((item) => item.label)).toEqual([
        'Personal',
        'General',
        'Members',
        'API Keys',
        'Policy',
        'Brands',
        'Help',
      ]);
    });

    it('gates Billing behind the enterprise edition', () => {
      expect(
        buildSettingsMenuItems({ isEnterprise: false }).some(
          (item) => item.label === 'Billing',
        ),
      ).toBe(false);

      expect(
        buildSettingsMenuItems({ isEnterprise: true }).map((i) => i.label),
      ).toEqual([
        'Personal',
        'General',
        'Members',
        'Billing',
        'API Keys',
        'Policy',
        'Brands',
        'Help',
      ]);
    });

    it('keeps the organization sub-pages under one collapsible Organization group', () => {
      const orgItems = buildSettingsMenuItems().filter(
        (item) => item.group === 'Organization',
      );

      expect(orgItems.map((item) => item.label)).toEqual([
        'General',
        'Members',
        'API Keys',
        'Policy',
      ]);
      // Only the first item of the group carries the collapsible header flag.
      expect(orgItems[0]?.isCollapsible).toBe(true);
      expect(orgItems.slice(1).every((item) => !item.isCollapsible)).toBe(true);
    });

    it('leaves Personal, Brands and Help ungrouped (flat under Settings)', () => {
      const flat = buildSettingsMenuItems().filter((item) => !item.group);
      expect(flat.map((item) => item.label)).toEqual([
        'Personal',
        'Brands',
        'Help',
      ]);
    });
  });

  describe('on a brand route (routeBrandSlug present)', () => {
    const items = buildSettingsMenuItems({ routeBrandSlug: 'moonrise' });

    it('expands Brands into the brand sub-pages', () => {
      expect(items.map((item) => item.label)).toEqual([
        'Personal',
        'General',
        'Members',
        'API Keys',
        'Policy',
        'All Brands',
        'Overview',
        'Voice',
        'Harness',
        'Interview',
        'Publishing',
        'Agent Defaults',
        'Help',
      ]);
    });

    it('groups the brand sub-pages under one collapsible Brands group', () => {
      const brandGroup = items.filter((item) => item.group === 'Brands');
      expect(brandGroup.map((item) => item.label)).toEqual([
        'All Brands',
        'Overview',
        'Voice',
        'Harness',
        'Interview',
        'Publishing',
        'Agent Defaults',
      ]);
      expect(brandGroup[0]?.isCollapsible).toBe(true);
    });

    it('scopes the brand sub-pages to the brand and All Brands to the org', () => {
      const brandGroup = items.filter((item) => item.group === 'Brands');
      const allBrands = brandGroup.find((item) => item.label === 'All Brands');
      const voice = brandGroup.find((item) => item.label === 'Voice');

      expect(allBrands).toMatchObject({
        hrefScope: 'organization',
        href: '/settings/brands',
      });
      expect(voice).toMatchObject({
        hrefScope: 'brand',
        href: '/settings/voice',
      });
    });
  });

  it('marks the shared /settings roots as exact-match so they do not highlight sub-routes', () => {
    const items = buildSettingsMenuItems({ routeBrandSlug: 'moonrise' });
    const exactRoots = items
      .filter((item) => item.isExactMatch)
      .map((item) => item.label);

    expect(exactRoots).toEqual([
      'Personal',
      'General',
      'All Brands',
      'Overview',
    ]);
  });

  it('scopes Personal to personal and the organization group to organization', () => {
    const items = buildSettingsMenuItems();
    expect(items.find((i) => i.label === 'Personal')?.hrefScope).toBe(
      'personal',
    );
    for (const label of ['General', 'Members', 'API Keys', 'Policy', 'Help']) {
      expect(items.find((i) => i.label === label)?.hrefScope).toBe(
        'organization',
      );
    }
  });

  it('gives every item a label, href, and both icon variants', () => {
    for (const item of buildSettingsMenuItems({
      routeBrandSlug: 'moonrise',
      isEnterprise: true,
    })) {
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
