import { describe, expect, it } from 'vitest';
import { DISCOVERY_MENU_ITEMS } from './discovery-menu-items.config';

describe('DISCOVERY_MENU_ITEMS', () => {
  it('renders Discovery peers then platform feeds (no Socials peer)', () => {
    expect(DISCOVERY_MENU_ITEMS.map((item) => item.label)).toEqual([
      'Overview',
      'Following',
      'Ads',
      'X',
      'Instagram',
      'YouTube',
      'TikTok',
      'LinkedIn',
      'Reddit',
      'Pinterest',
    ]);
  });

  it('keeps Following and Ads above the Platforms group', () => {
    const labels = DISCOVERY_MENU_ITEMS.map((item) => item.label);
    expect(labels.indexOf('Following')).toBeLessThan(labels.indexOf('X'));
    expect(labels.indexOf('Ads')).toBeLessThan(labels.indexOf('X'));
    expect(labels.indexOf('Following')).toBeLessThan(labels.indexOf('Ads'));
  });

  it('groups platform feeds under Platforms', () => {
    const platforms = DISCOVERY_MENU_ITEMS.filter(
      (item) => item.group === 'Platforms',
    );

    expect(platforms.map((item) => item.href)).toEqual([
      '/discovery/twitter',
      '/discovery/instagram',
      '/discovery/youtube',
      '/discovery/tiktok',
      '/discovery/linkedin',
      '/discovery/reddit',
      '/discovery/pinterest',
    ]);
    expect(platforms[0]?.isCollapsible).toBe(true);
  });

  it('treats retired /discovery/socials as an Overview matchPath', () => {
    const overview = DISCOVERY_MENU_ITEMS.find(
      (item) => item.label === 'Overview',
    );
    const following = DISCOVERY_MENU_ITEMS.find(
      (item) => item.label === 'Following',
    );

    expect(overview?.matchPaths ?? []).toContain('/discovery/socials');
    expect(following?.href).toBe('/discovery/following');
    expect(overview?.matchPaths ?? []).not.toContain('/discovery/following');
  });

  it('uses /discovery/overview as the home href (not /discovery/discovery)', () => {
    expect(DISCOVERY_MENU_ITEMS[0]?.href).toBe('/discovery/overview');
  });

  it('keeps Workspace and Messages routes out of the Discovery sidebar', () => {
    const hrefs = DISCOVERY_MENU_ITEMS.map((item) => item.href);

    expect(hrefs).not.toContain('/workspace');
    expect(hrefs).not.toContain('/messages');
    expect(hrefs).not.toContain('/discovery/socials');
  });

  it('has no duplicate hrefs', () => {
    const hrefs = DISCOVERY_MENU_ITEMS.flatMap((item) =>
      item.href ? [item.href] : [],
    );
    const unique = new Set(hrefs);

    expect(hrefs.length).toBe(unique.size);
  });
});
