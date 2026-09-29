import { describe, expect, it } from 'vitest';
import { STUDIO_MENU_ITEMS } from './studio-menu-items.config';

describe('STUDIO_MENU_ITEMS', () => {
  it('lists Studio surfaces in a single flat group, Generate first', () => {
    expect(STUDIO_MENU_ITEMS.map((item) => item.label)).toEqual([
      'Generate',
      'Storyboard',
      'Clips',
      'Batch',
      'Editor',
    ]);
    expect(STUDIO_MENU_ITEMS.every((item) => item.group === '')).toBe(true);
    expect(STUDIO_MENU_ITEMS.map((item) => item.href)).toEqual([
      '/studio/generate',
      '/studio/storyboard',
      '/studio/clips',
      '/studio/batch',
      '/studio/editor',
    ]);
  });

  it('exposes every studio route that has a page behind a nav entry', () => {
    // Regression guard for the orphaned `/studio/clips` route: the page and the
    // workspace-shell breadcrumb existed, but nothing linked to it.
    const hrefs = STUDIO_MENU_ITEMS.map((item) => item.href);

    expect(hrefs).toContain('/studio/generate');
    expect(hrefs).toContain('/studio/clips');
    expect(hrefs).toContain('/studio/editor');
    expect(hrefs).not.toContain('/studio/edit');
    expect(hrefs).not.toContain('/studio/audio');
    expect(hrefs).not.toContain('/library/voices');
  });

  it('exposes the Remotion timeline as Studio Editor (path /studio/editor)', () => {
    // #5461: the finishing surface is named Editor in nav and route alike; the
    // old `/studio/edit` path is gone.
    const editor = STUDIO_MENU_ITEMS.find(
      (item) => item.href === '/studio/editor',
    );
    const batch = STUDIO_MENU_ITEMS.find(
      (item) => item.href === '/studio/batch',
    );
    const storyboard = STUDIO_MENU_ITEMS.find(
      (item) => item.href === '/studio/storyboard',
    );

    expect(editor).toMatchObject({
      href: '/studio/editor',
      label: 'Editor',
      matchPaths: ['/studio/editor', '/studio/editor/new'],
    });
    expect(batch).toMatchObject({
      href: '/studio/batch',
      label: 'Batch',
      matchPaths: ['/studio/batch', '/studio/batch/new'],
    });
    expect(storyboard).toMatchObject({
      label: 'Storyboard',
      matchPaths: ['/studio/storyboard', '/studio/storyboard/new'],
    });
  });
});
