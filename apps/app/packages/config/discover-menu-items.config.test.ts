import { describe, expect, it } from 'vitest';
import {
  DISCOVER_LOGO_HREF,
  DISCOVER_MENU_ITEMS,
} from './discover-menu-items.config';

describe('DISCOVER_MENU_ITEMS', () => {
  it('points the logo at Discover Discovery', () => {
    expect(DISCOVER_LOGO_HREF).toBe('/discover/discovery');
  });

  it('renders the Discover entrypoints only', () => {
    expect(DISCOVER_MENU_ITEMS.map((item) => item.label)).toEqual([
      'Discovery',
      'Socials',
      'Ads',
    ]);
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
