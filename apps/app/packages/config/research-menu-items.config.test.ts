import { describe, expect, it } from 'vitest';
import {
  RESEARCH_LOGO_HREF,
  RESEARCH_MENU_ITEMS,
} from './research-menu-items.config';

describe('RESEARCH_MENU_ITEMS', () => {
  it('points the logo at Research Discovery', () => {
    expect(RESEARCH_LOGO_HREF).toBe('/research/discovery');
  });

  it('renders the Research entrypoints only', () => {
    expect(RESEARCH_MENU_ITEMS.map((item) => item.label)).toEqual([
      'Discovery',
      'Socials',
      'Ads',
    ]);
  });

  it('keeps Workspace and Messages routes out of the Research sidebar', () => {
    const hrefs = RESEARCH_MENU_ITEMS.map((item) => item.href);

    expect(hrefs).not.toContain('/workspace/overview');
    expect(hrefs).not.toContain('/messages');
  });

  it('has no duplicate hrefs', () => {
    const hrefs = RESEARCH_MENU_ITEMS.flatMap((item) =>
      item.href ? [item.href] : [],
    );
    const unique = new Set(hrefs);

    expect(hrefs.length).toBe(unique.size);
  });
});
