import { describe, expect, it } from 'vitest';
import { POSTS_LOGO_HREF, POSTS_MENU_ITEMS } from './posts-menu-items.config';

describe('POSTS_MENU_ITEMS', () => {
  it('has no duplicate hrefs', () => {
    const hrefs = POSTS_MENU_ITEMS.flatMap((item) =>
      item.href ? [item.href] : [],
    );

    expect(hrefs.length).toBe(new Set(hrefs).size);
  });

  it('all hrefs stay on the posts surface', () => {
    for (const item of POSTS_MENU_ITEMS) {
      expect(item.href).toMatch(/^\/posts(?:\/|$)/);
    }
  });

  it('owns no analytics destination', () => {
    // Analytics is a single home: the module's own `/posts/analytics` page is
    // retired and `/analytics/posts` is the only posts-analytics surface.
    const hrefs = POSTS_MENU_ITEMS.map((item) => item.href);
    const labels = POSTS_MENU_ITEMS.map((item) => item.label);

    expect(hrefs).not.toContain('/posts/analytics');
    expect(labels).not.toContain('Analytics');
  });

  it('keeps the posts logo href pointed at the posts root', () => {
    expect(POSTS_LOGO_HREF).toBe('/posts');
  });
});
