import { describe, expect, it } from 'vitest';
import { DISCOVERY_MENU_ITEMS } from './discovery-menu-items.config';

describe('DISCOVERY_MENU_ITEMS', () => {
  it('renders exactly Overview, Following, Ads', () => {
    expect(DISCOVERY_MENU_ITEMS.map((item) => item.label)).toEqual([
      'Overview',
      'Following',
      'Ads',
    ]);
  });

  it('uses /discovery/overview as the home href (not /discovery/discovery)', () => {
    expect(DISCOVERY_MENU_ITEMS[0]?.href).toBe('/discovery/overview');
  });

  it('treats Following as a query-param variant of Overview, not its own route', () => {
    const following = DISCOVERY_MENU_ITEMS.find(
      (item) => item.label === 'Following',
    );

    expect(following?.href).toBe('/discovery/overview?source=following');
    expect(following?.matchSearchParams).toEqual({ source: 'following' });
    expect(following?.matchPaths).toEqual(['/discovery/overview']);
  });

  it('only marks Overview active when the source query param is absent', () => {
    const overview = DISCOVERY_MENU_ITEMS.find(
      (item) => item.label === 'Overview',
    );

    expect(overview?.matchSearchParams).toEqual({ source: null });
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
    expect(hrefs).not.toContain('/discovery/following');
    expect(hrefs).not.toContain('/discovery/twitter');
    expect(hrefs).not.toContain('/discovery/instagram');
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
