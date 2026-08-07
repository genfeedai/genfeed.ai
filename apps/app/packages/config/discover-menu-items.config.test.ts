import { describe, expect, it } from 'vitest';
import {
  DISCOVER_LOGO_HREF,
  DISCOVER_MENU_ITEMS,
} from './discover-menu-items.config';

describe('DISCOVER_MENU_ITEMS', () => {
  it('points the logo at Discover Overview', () => {
    expect(DISCOVER_LOGO_HREF).toBe('/discover/overview');
  });

  it('renders Discover peers then platform feeds (no Socials peer)', () => {
    expect(DISCOVER_MENU_ITEMS.map((item) => item.label)).toEqual([
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
    const labels = DISCOVER_MENU_ITEMS.map((item) => item.label);
    expect(labels.indexOf('Following')).toBeLessThan(labels.indexOf('X'));
    expect(labels.indexOf('Ads')).toBeLessThan(labels.indexOf('X'));
    expect(labels.indexOf('Following')).toBeLessThan(labels.indexOf('Ads'));
  });

  it('groups platform feeds under Platforms', () => {
    const platforms = DISCOVER_MENU_ITEMS.filter(
      (item) => item.group === 'Platforms',
    );

    expect(platforms.map((item) => item.href)).toEqual([
      '/discover/twitter',
      '/discover/instagram',
      '/discover/youtube',
      '/discover/tiktok',
      '/discover/linkedin',
      '/discover/reddit',
      '/discover/pinterest',
    ]);
    expect(platforms[0]?.isCollapsible).toBe(true);
  });

  it('treats retired /discover/socials as an Overview matchPath', () => {
    const overview = DISCOVER_MENU_ITEMS.find(
      (item) => item.label === 'Overview',
    );
    const following = DISCOVER_MENU_ITEMS.find(
      (item) => item.label === 'Following',
    );

    expect(overview?.matchPaths ?? []).toContain('/discover/socials');
    expect(following?.href).toBe('/discover/following');
    expect(overview?.matchPaths ?? []).not.toContain('/discover/following');
  });

  it('uses /discover/overview as the home href (not /discover/discovery)', () => {
    expect(DISCOVER_MENU_ITEMS[0]?.href).toBe('/discover/overview');
  });

  it('keeps Workspace and Messages routes out of the Discover sidebar', () => {
    const hrefs = DISCOVER_MENU_ITEMS.map((item) => item.href);

    expect(hrefs).not.toContain('/workspace');
    expect(hrefs).not.toContain('/messages');
    expect(hrefs).not.toContain('/discover/socials');
  });

  it('has no duplicate hrefs', () => {
    const hrefs = DISCOVER_MENU_ITEMS.flatMap((item) =>
      item.href ? [item.href] : [],
    );
    const unique = new Set(hrefs);

    expect(hrefs.length).toBe(unique.size);
  });
});
