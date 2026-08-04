import { describe, expect, it } from 'vitest';
import {
  DISCOVER_LOGO_HREF,
  DISCOVER_MENU_ITEMS,
} from './discover-menu-items.config';

describe('DISCOVER_MENU_ITEMS', () => {
  it('points the logo at Discover Overview', () => {
    expect(DISCOVER_LOGO_HREF).toBe('/discover/overview');
  });

  it('renders the Discover entrypoints only', () => {
    expect(DISCOVER_MENU_ITEMS.map((item) => item.label)).toEqual([
      'Overview',
      'Socials',
      'Following',
      'Ads',
    ]);
  });

  it('keeps Following as a peer of Socials, not a Socials matchPath', () => {
    const socials = DISCOVER_MENU_ITEMS.find(
      (item) => item.label === 'Socials',
    );
    const following = DISCOVER_MENU_ITEMS.find(
      (item) => item.label === 'Following',
    );

    expect(following?.href).toBe('/discover/following');
    expect(socials?.matchPaths ?? []).not.toContain('/discover/following');
  });

  it('uses /discover/overview as the home href (not /discover/discovery)', () => {
    expect(DISCOVER_MENU_ITEMS[0]?.href).toBe('/discover/overview');
  });

  it('keeps Workspace and Messages routes out of the Discover sidebar', () => {
    const hrefs = DISCOVER_MENU_ITEMS.map((item) => item.href);

    expect(hrefs).not.toContain('/workspace');
    expect(hrefs).not.toContain('/messages');
  });

  it('has no duplicate hrefs', () => {
    const hrefs = DISCOVER_MENU_ITEMS.flatMap((item) =>
      item.href ? [item.href] : [],
    );
    const unique = new Set(hrefs);

    expect(hrefs.length).toBe(unique.size);
  });
});
