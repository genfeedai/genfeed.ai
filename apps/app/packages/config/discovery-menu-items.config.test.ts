import { describe, expect, it } from 'vitest';
import { DISCOVERY_MENU_ITEMS } from './discovery-menu-items.config';

describe('DISCOVERY_MENU_ITEMS', () => {
  it('treats Following as a query-param variant of Overview, not its own route', () => {
    const following = DISCOVERY_MENU_ITEMS.find(
      (item) => item.label === 'Following',
    );

    expect(following?.href).toBe('/discovery/overview?source=following');
    expect(following?.matchSearchParams).toEqual({ source: 'following' });
    expect(following?.matchPaths).toEqual(['/discovery/overview']);
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
});
