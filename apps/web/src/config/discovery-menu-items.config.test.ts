import { describe, expect, it } from 'vitest';
import { DISCOVERY_MENU_ITEMS } from './discovery-menu-items.config';

describe('DISCOVERY_MENU_ITEMS', () => {
  it('renders exactly Feed, Trends, Ads', () => {
    expect(DISCOVERY_MENU_ITEMS.map((item) => item.label)).toEqual([
      'Feed',
      'Trends',
      'Ads',
    ]);
  });

  it('owns market trends at /discovery/trends', () => {
    const trends = DISCOVERY_MENU_ITEMS.find((item) => item.label === 'Trends');

    expect(trends?.href).toBe('/discovery/trends');
    expect(trends?.matchPaths).toEqual(['/discovery/trends']);
  });

  it('uses /discovery/feed as the home href (not /discovery/discovery)', () => {
    expect(DISCOVERY_MENU_ITEMS[0]?.href).toBe('/discovery/feed');
  });

  it('keeps Feed active whatever the source filter is', () => {
    const feed = DISCOVERY_MENU_ITEMS.find((item) => item.label === 'Feed');

    expect(feed?.matchSearchParams).toBeUndefined();
    expect(feed?.matchPaths).toEqual(['/discovery', '/discovery/feed']);
  });

  it('has no Platforms group', () => {
    const platforms = DISCOVERY_MENU_ITEMS.filter(
      (item) => item.group === 'Platforms',
    );

    expect(platforms).toEqual([]);
  });

  it('scopes Ads matchPaths to the single consolidated ads route', () => {
    const ads = DISCOVERY_MENU_ITEMS.find((item) => item.label === 'Ads');

    expect(ads?.href).toBe('/discovery/ads');
    expect(ads?.matchPaths).toEqual(['/discovery/ads']);
  });

  it('keeps Workspace, Messages, and retired Discovery routes out of the sidebar', () => {
    const hrefs = DISCOVERY_MENU_ITEMS.map((item) => item.href);

    expect(hrefs).not.toContain('/workspace');
    expect(hrefs).not.toContain('/messages');
    expect(hrefs).not.toContain('/discovery/socials');
    expect(hrefs).not.toContain('/discovery/discovery');
    expect(hrefs).not.toContain('/discovery/twitter');
    expect(hrefs).not.toContain('/discovery/instagram');
    expect(hrefs).not.toContain('/discovery/following');
    expect(hrefs).not.toContain('/discovery/trend-turnover');
    expect(hrefs).not.toContain('/discovery/overview');
  });

  it('has no duplicate hrefs', () => {
    const hrefs = DISCOVERY_MENU_ITEMS.flatMap((item) =>
      item.href ? [item.href] : [],
    );
    const unique = new Set(hrefs);

    expect(hrefs.length).toBe(unique.size);
  });

  it('all items have required fields: label, href, outline, solid', () => {
    for (const item of DISCOVERY_MENU_ITEMS) {
      expect(item.label).toBeTruthy();
      expect(item.href).toBeTruthy();
      expect(item.outline).toBeDefined();
      expect(item.solid).toBeDefined();
    }
  });
});
