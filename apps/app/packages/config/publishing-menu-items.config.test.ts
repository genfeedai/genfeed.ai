import { describe, expect, it } from 'vitest';
import { PUBLISHING_MENU_ITEMS } from './publishing-menu-items.config';

describe('PUBLISHING_MENU_ITEMS', () => {
  it('does not host creation/automation destinations (Automation + actions own those)', () => {
    const hrefs = PUBLISHING_MENU_ITEMS.map((item) => item.href);
    const labels = PUBLISHING_MENU_ITEMS.map((item) => item.label);

    expect(hrefs).toContain('/publishing/campaigns');
    expect(hrefs).not.toContain('/automation/campaigns');
    expect(hrefs).not.toContain('/publishing/outreach-campaigns');
    expect(hrefs).not.toContain('/publishing/newsletters');
    expect(hrefs).not.toContain('/publishing/remix');
    expect(labels).toContain('Campaigns');
    expect(labels).not.toContain('Outreach');
    expect(labels).not.toContain('Newsletters');
    expect(labels).not.toContain('Remix');
  });
});
