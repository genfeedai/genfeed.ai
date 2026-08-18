import { describe, expect, it } from 'vitest';
import {
  STUDIO_LOGO_HREF,
  STUDIO_MENU_ITEMS,
} from './studio-menu-items.config';

describe('STUDIO_MENU_ITEMS', () => {
  it('lists production surfaces in a single flat Studio group', () => {
    expect(STUDIO_MENU_ITEMS.map((item) => item.label)).toEqual([
      'Storyboard',
      'Clips',
      'Batch',
      'Fastlane',
      'Audio',
      'Edit',
    ]);
    expect(STUDIO_MENU_ITEMS.every((item) => item.group === '')).toBe(true);
    expect(STUDIO_MENU_ITEMS.map((item) => item.href)).toEqual([
      '/studio/storyboard',
      '/studio/clips',
      '/studio/batch',
      '/studio/fastlane',
      '/library/voices',
      '/studio/edit',
    ]);
  });

  it('exposes every studio route that has a page behind a nav entry', () => {
    // Regression guard for the orphaned `/studio/clips` route: the page and the
    // workspace-shell breadcrumb existed, but nothing linked to it.
    const hrefs = STUDIO_MENU_ITEMS.map((item) => item.href);

    expect(hrefs).toContain('/studio/clips');
    expect(hrefs).toContain('/studio/edit');
    expect(hrefs).toContain('/library/voices');
    expect(hrefs).not.toContain('/studio/audio');
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

  it('keeps the studio logo href pointed at the production home', () => {
    expect(STUDIO_LOGO_HREF).toBe('/studio/storyboard');
  });
});
