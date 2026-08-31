import { describe, expect, it } from 'vitest';
import { STUDIO_MENU_ITEMS } from './studio-menu-items.config';

describe('STUDIO_MENU_ITEMS', () => {
  it('lists Studio surfaces in a single flat group, Generate first', () => {
    expect(STUDIO_MENU_ITEMS.map((item) => item.label)).toEqual([
      'Generate',
      'Storyboard',
      'Clips',
      'Batch',
      'Fastlane',
      'Edit',
    ]);
    expect(STUDIO_MENU_ITEMS.every((item) => item.group === '')).toBe(true);
    expect(STUDIO_MENU_ITEMS.map((item) => item.href)).toEqual([
      '/studio/generate',
      '/studio/storyboard',
      '/studio/clips',
      '/studio/batch',
      '/studio/fastlane',
      '/studio/edit',
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
    expect(hrefs).toContain('/studio/edit');
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

  it('exposes the merged editor as Studio Edit (path /studio/edit)', () => {
    // #2309: the Remotion editor stopped being a core app; Studio's nav is now
    // its only menu entry. Label matches the URL segment.
    const edit = STUDIO_MENU_ITEMS.find((item) => item.href === '/studio/edit');

    expect(edit).toMatchObject({
      href: '/studio/edit',
      label: 'Edit',
      matchPaths: ['/studio/edit', '/studio/edit/new'],
    });
  });
});
