import { describe, expect, it } from 'vitest';
import { STUDIO_MENU_ITEMS } from './studio-menu-items.config';

describe('STUDIO_MENU_ITEMS', () => {
  it('lists Studio surfaces in a single flat group, Generate first', () => {
    expect(STUDIO_MENU_ITEMS.map((item) => item.label)).toEqual([
      'Generate',
      'Motion',
      'Storyboard',
      'Clips',
      'Batch',
      'Editor',
    ]);
    expect(STUDIO_MENU_ITEMS.every((item) => item.group === '')).toBe(true);
    expect(STUDIO_MENU_ITEMS.map((item) => item.href)).toEqual([
      '/studio/generate',
      '/studio/motion',
      '/studio/storyboard',
      '/studio/clips',
      '/studio/batch',
      '/studio/editor',
    ]);
  });

  it('never hands the operator off to another module app', () => {
    // The old "Audio" entry pointed at `/library/voices` — a browse grid in a
    // different app, reached from Studio's own nav. No Studio menu entry may
    // leave `/studio` again, by href or by match path.
    for (const item of STUDIO_MENU_ITEMS) {
      expect(item.href.startsWith('/studio')).toBe(true);

      for (const matchPath of item.matchPaths ?? []) {
        expect(matchPath.startsWith('/studio')).toBe(true);
      }
    }
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

  it('carries no Edit/Automation subgroup headers', () => {
    expect(
      STUDIO_MENU_ITEMS.some(
        (item) => item.group === 'Edit' || item.group === 'Automation',
      ),
    ).toBe(false);
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
