import { describe, expect, it } from 'vitest';
import {
  STUDIO_LOGO_HREF,
  STUDIO_MENU_ITEMS,
} from './studio-menu-items.config';

describe('STUDIO_MENU_ITEMS', () => {
  it('groups storyboard, batch, and fastlane under Automation', () => {
    const automationItems = STUDIO_MENU_ITEMS.filter(
      (item) => item.group === 'Automation',
    );

    expect(automationItems.map((item) => item.label)).toEqual([
      'Storyboard',
      'Batch',
      'Fastlane',
    ]);
    expect(automationItems[0]).toMatchObject({
      hasDividerAbove: true,
      href: '/studio/storyboard',
    });
    expect(automationItems[1]?.href).toBe('/studio/batch');
  });

  it('keeps generation modes ungrouped above Automation', () => {
    const generationLabels = STUDIO_MENU_ITEMS.filter(
      (item) => item.group === '',
    ).map((item) => item.label);

    expect(generationLabels).toEqual(['Image', 'Video', 'Avatar', 'Music']);
  });

  it('keeps the studio logo href pointed at the library overview', () => {
    expect(STUDIO_LOGO_HREF).toBe('/library');
  });
});
