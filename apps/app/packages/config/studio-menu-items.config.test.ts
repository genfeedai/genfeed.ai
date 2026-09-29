import { describe, expect, it } from 'vitest';
import { STUDIO_MENU_ITEMS } from './studio-menu-items.config';

describe('STUDIO_MENU_ITEMS', () => {
  it('lists Studio surfaces in a single flat group, Generate first', () => {
    expect(STUDIO_MENU_ITEMS.map((item) => item.label)).toEqual([
      'Generate',
      'Storyboard',
      'Clips',
      'Batch',
      'Edit',
    ]);
    expect(STUDIO_MENU_ITEMS.every((item) => item.group === '')).toBe(true);
    expect(STUDIO_MENU_ITEMS.map((item) => item.href)).toEqual([
      '/studio/generate',
      '/studio/storyboard',
      '/studio/clips',
      '/studio/batch',
      '/studio/edit',
    ]);
  });

  it('exposes every studio route that has a page behind a nav entry', () => {
    // Regression guard for the orphaned `/studio/clips` route: the page and the
    // workspace-shell breadcrumb existed, but nothing linked to it.
    const hrefs = STUDIO_MENU_ITEMS.map((item) => item.href);

    expect(hrefs).toContain('/studio/generate');
    expect(hrefs).toContain('/studio/clips');
    expect(hrefs).toContain('/studio/edit');
    expect(hrefs).not.toContain('/studio/audio');
    expect(hrefs).not.toContain('/library/voices');
  });
});
