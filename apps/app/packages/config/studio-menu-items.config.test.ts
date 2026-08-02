import { describe, expect, it } from 'vitest';
import {
  STUDIO_LOGO_HREF,
  STUDIO_MENU_ITEMS,
} from './studio-menu-items.config';

describe('STUDIO_MENU_ITEMS', () => {
  it('groups storyboard, clips, batch, and fastlane under Automation', () => {
    const automationItems = STUDIO_MENU_ITEMS.filter(
      (item) => item.group === 'Automation',
    );

    expect(automationItems.map((item) => item.label)).toEqual([
      'Storyboard',
      'Clips',
      'Batch',
      'Fastlane',
    ]);
    expect(automationItems[0]?.href).toBe('/studio/storyboard');
    expect(automationItems[1]?.href).toBe('/studio/clips');
    expect(automationItems[2]?.href).toBe('/studio/batch');
    expect(automationItems[3]?.href).toBe('/studio/fastlane');
  });

  it('exposes every studio route that has a page behind a nav entry', () => {
    // Regression guard for the orphaned `/studio/clips` route: the page and the
    // workspace-shell breadcrumb existed, but nothing linked to it.
    const hrefs = STUDIO_MENU_ITEMS.map((item) => item.href);

    expect(hrefs).toContain('/studio/clips');
  });

  it('carries no ungrouped one-off generation modes', () => {
    // The standalone Image/Video/Avatar/Music tabs are retired — one-off
    // generation runs through the Agent. Edit remains a production surface.
    const ungrouped = STUDIO_MENU_ITEMS.filter((item) => item.group === '');

    expect(ungrouped).toEqual([]);
  });

  it('exposes the merged editor as the Edit timeline entry', () => {
    // #2309: the Remotion editor stopped being a core app; Studio's nav is now
    // its only menu entry.
    const editItems = STUDIO_MENU_ITEMS.filter((item) => item.group === 'Edit');

    expect(editItems.map((item) => item.label)).toEqual(['Timeline']);
    expect(editItems[0]).toMatchObject({
      hasDividerAbove: true,
      href: '/studio/edit',
      matchPaths: ['/studio/edit'],
    });
  });

  it('places Edit before Automation', () => {
    expect(STUDIO_MENU_ITEMS.map((item) => item.group)).toEqual([
      'Edit',
      'Automation',
      'Automation',
      'Automation',
      'Automation',
    ]);
  });

  it('keeps the studio logo href pointed at the library overview', () => {
    expect(STUDIO_LOGO_HREF).toBe('/library');
  });
});
